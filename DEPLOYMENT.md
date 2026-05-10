# 部署指南

三种部署方式，按顺序难度递增。**部署前请先看 [HARDENING.md](./HARDENING.md) 完成生产加固。**

---

## 方案 A：Vercel + Railway（最快，海外节点）

适合：演示阶段、长期试用、不怕国外节点延迟。

**架构**：
- 前端 → Vercel（静态托管 + 自动 https + CDN）
- 后端 → Railway（Node 服务 + 内置磁盘存 SQLite）

### 1. 后端到 Railway

```bash
# 仓库要先推到 GitHub
cd "/Users/daviewu/Study/me/“评论聚合”网站"
git init
git add .
git commit -m "init"
gh repo create comment-aggregator --private --source=. --push
```

Railway 网站操作：
1. New Project → Deploy from GitHub → 选这个仓库
2. Root Directory 填 `backend`
3. Build Command: `pnpm install && pnpm prisma generate && pnpm build`
4. Start Command: `pnpm prisma migrate deploy && pnpm start`
5. **环境变量**：
   ```
   QIANWEN_API_KEY=sk-xxxxxxxxxxxx
   QIANWEN_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
   QIANWEN_MODEL=qwen-vl-max-latest
   DATABASE_URL=file:/data/prod.db          # 注意：指向 Volume
   JWT_SECRET=（用 `openssl rand -hex 32` 生成）
   PORT=3001
   NODE_ENV=production
   ```
6. **Volumes**：挂 `/data`，否则 SQLite 文件会随容器重启丢失
7. 部署后拿到一个 `https://xxxxx.up.railway.app`，记下来

### 2. 前端到 Vercel

```bash
# Vercel CLI 或网站都行；这里用网站
```

Vercel 网站操作：
1. Add New Project → Import git repo
2. Root Directory 填 `frontend`
3. Framework Preset: `Vite`
4. **环境变量**：无（前端不读环境变量；API 走 rewrite）
5. **rewrites** —— 在 `frontend/vercel.json`（下面创建）

需要在仓库新增 `frontend/vercel.json`：

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://xxxxx.up.railway.app/api/:path*" }
  ]
}
```

把 `xxxxx.up.railway.app` 换成上一步 Railway 给的真实域名。

部署后访问 `https://your-app.vercel.app`，登录验证。

### 3. 备份

Railway 的 Volume 不是免费免运维。建议：
- 每天跑一次 `cron` 把 `prod.db` 拉到对象存储（S3 / R2）
- 或在 Railway 内部加 cron task 把 db 文件 base64 推到一个备份接口

---

## 方案 B：阿里云轻量服务器（国内首选）

适合：长期使用、国内访问、费用可控（轻量 ~70 元/月起）。

### 资源准备

- 阿里云轻量应用服务器：CentOS / Ubuntu 22.04，最低 2 核 2G 即够
- 域名一个（备案过的，否则用阿里云国际或 IP+端口直连）
- HTTPS 证书：用 Let's Encrypt（免费）或阿里云免费 SSL

### 一次性安装

```bash
# 进服务器
ssh root@<your-server-ip>

# 安装 Node 20 + pnpm + nginx + pm2
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -    # 或 apt 源
apt install -y nodejs nginx
npm install -g pnpm pm2

# 拉代码
git clone <your-repo-url> /opt/comment-aggregator
cd /opt/comment-aggregator

# 后端
cd backend
cp .env.example .env
vim .env                     # 填 QIANWEN_API_KEY、JWT_SECRET 等
pnpm install
pnpm prisma migrate deploy
pnpm build

# 前端
cd ../frontend
pnpm install
pnpm build                   # 产物在 frontend/dist

# 启动后端（pm2 守护，开机自启）
cd ../backend
pm2 start dist/index.js --name comment-aggregator
pm2 startup && pm2 save
```

后端会自动托管 `frontend/dist`（前面阶段5加过的逻辑）。这时 `:3001` 已经是完整网站了。

### nginx 反代 + HTTPS

`/etc/nginx/conf.d/comment-aggregator.conf`：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 30m;   # 多图上传需要

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;        # AI 调用最长 30s + buffer
    }
}
```

Let's Encrypt 证书：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
nginx -t && systemctl reload nginx
```

### 备份

```bash
# /etc/cron.d/comment-aggregator-backup
0 3 * * * root cp /opt/comment-aggregator/backend/prod.db /opt/backups/$(date +\%F).db && find /opt/backups -mtime +30 -delete
```

### 升级流程

```bash
cd /opt/comment-aggregator
git pull
cd backend && pnpm install && pnpm prisma migrate deploy && pnpm build
cd ../frontend && pnpm install && pnpm build
pm2 restart comment-aggregator
```

---

## 方案 C：自部署 / Docker

适合：你已有 Linux 服务器或 Docker 环境，要完全控制。

### Dockerfile（多阶段构建，单镜像）

仓库根目录新增 `Dockerfile`：

```dockerfile
# ---- 1. 构建前端 ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# ---- 2. 构建后端 ----
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY backend/ ./
RUN pnpm prisma generate && pnpm build

# ---- 3. 运行 ----
FROM node:20-alpine
WORKDIR /app
RUN corepack enable

# 后端运行时只需要 dist + node_modules + prisma
COPY --from=backend-builder /app/backend/package.json ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/prisma ./backend/prisma
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/index.js"]
```

### docker-compose.yml

```yaml
services:
  app:
    build: .
    image: comment-aggregator:latest
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/backend/data        # SQLite 文件在外
    environment:
      QIANWEN_API_KEY: ${QIANWEN_API_KEY}
      QIANWEN_ENDPOINT: https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
      QIANWEN_MODEL: qwen-vl-max-latest
      DATABASE_URL: file:./data/prod.db
      JWT_SECRET: ${JWT_SECRET}
```

启动：

```bash
echo "QIANWEN_API_KEY=sk-xxx" > .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d --build
docker compose logs -f
```

前面再放一个 nginx / Caddy 做 HTTPS 即可。

---

## 三方案对比

| 维度 | Vercel + Railway | 阿里云轻量 | Docker 自部署 |
|---|---|---|---|
| 上手难度 | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| 国内访问速度 | 慢（境外） | 快 | 看你机房 |
| 月成本（小流量） | 免费~$5 | ~70 元 | 看你硬件 |
| 备份 | 需手工配 | cron 容易 | volume 直接备 |
| 适合 | 长期个人试用 | 团队正式用 | 已有运维 |

---

## 数据迁移（SQLite → PostgreSQL，未来需要时）

当前 schema 完全兼容 PostgreSQL。迁移方法：

1. `backend/prisma/schema.prisma` 把 `provider = "sqlite"` 改成 `"postgresql"`
2. `DATABASE_URL` 改成 PostgreSQL 连接串
3. `pnpm prisma migrate dev --name switch-to-pg` 生成新 migration
4. 数据搬运：`prisma db pull` 旧库导出 → 重新 import 到新库；或直接写一段 ts 跑 `prisma.comment.findMany()` → `prisma2.comment.createMany()`

单人评论量级，SQLite 用到 10w 条都没问题，**短期不用迁。**
