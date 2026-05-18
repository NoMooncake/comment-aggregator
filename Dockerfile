# ============================================================
# Stage 1: 构建前端（Vite）
# ============================================================
FROM node:22-alpine AS frontend-builder
RUN npm install -g pnpm@11.0.9 --registry=https://registry.npmmirror.com \
 && pnpm config set registry https://registry.npmmirror.com
WORKDIR /app/frontend

COPY frontend/package.json frontend/pnpm-lock.yaml ./
# --ignore-scripts：跳过所有 postinstall（pnpm v11 在非 TTY 下会拒绝未批准的脚本）
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY frontend/ ./
# 说明：pnpm 已通过 optionalDependencies 装好 @esbuild/linux-musl-x64，
# esbuild 的 JS shim 运行时会自动定位该平台二进制，无需 npm rebuild。
RUN pnpm build
# 产物：/app/frontend/dist

# ============================================================
# Stage 2: 构建后端（TypeScript → JS + Prisma Client）
# ============================================================
FROM node:22-alpine AS backend-builder
# Prisma 在 Alpine 上需要 openssl + libc6-compat
RUN apk add --no-cache openssl libc6-compat \
 && npm install -g pnpm@11.0.9 --registry=https://registry.npmmirror.com \
 && pnpm config set registry https://registry.npmmirror.com
WORKDIR /app/backend

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY backend/ ./
# prisma generate 内置会下载引擎二进制，不依赖 postinstall
RUN pnpm exec prisma generate
RUN pnpm build
# 产物：/app/backend/dist + node_modules（含 prisma CLI 和已下载的引擎）

# ============================================================
# Stage 3: 运行时镜像（最小化）
# ============================================================
FROM node:22-alpine AS runtime
# Prisma 在 Alpine 上需要 openssl + libc6-compat；sqlite 给备份脚本备用
RUN apk add --no-cache openssl libc6-compat sqlite \
 && npm install -g pnpm@11.0.9 --registry=https://registry.npmmirror.com

WORKDIR /app

# 后端运行时所需最小集合（dist + node_modules 中已含引擎）
COPY backend/package.json backend/pnpm-lock.yaml ./backend/
COPY backend/prisma ./backend/prisma
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/dist ./backend/dist

# 前端构建产物（后端 index.ts 已支持托管 frontend/dist）
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# SQLite 数据存这里，外部挂载 volume
RUN mkdir -p /app/backend/data

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# 启动时先跑 migrate（幂等），再起服务
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/index.js"]
