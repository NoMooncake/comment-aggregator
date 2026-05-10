# 评论聚合管理网站

> 把小红书 / B站 / 视频号的评论用 AI 视觉识别集中到一个地方处理。单人作者 / 小团队适用。

## 它解决什么问题

同一条视频发到**小红书 / B站 / 视频号**3 个平台，挨个登录回复评论太费时间。

这个系统让你只在一处处理所有平台的评论：

```
助手截评论图  →  AI 识别成结构化数据  →  你集中写回复  →  导出 Excel 给助手去执行
```

## 工作流（端到端）

| 步骤 | 操作 | 备注 |
|---|---|---|
| 1 | 助手在各平台**截评论列表**截图 | 顶级评论，子回复忽略 |
| 2 | 上传到本系统（最多 9 张/批） | 拖拽 / 选择 / 手机拍照 |
| 3 | 阿里云通义千问 VL 解析每张图 | 自动判平台 + 提取每条评论 |
| 4 | **人工确认页**校对、修正、剔除 | AI 不会自动入库 |
| 5 | 评论列表里写回复 | pending → replied |
| 6 | **导出 Excel "待执行清单"** | 5 列：平台/昵称/原评论/时间/我的回复 |
| 7 | 助手按清单到各平台执行 | |
| 8 | 标记"已执行"（单条或批量） | replied → executed，状态闭环 |

## 截图

> *(可在此粘贴 Upload / Confirm / Comments 页面的截图)*

## 技术栈

- 前端：React 18 + Vite + TypeScript + TailwindCSS
- 后端：Node 20 + Express + TypeScript
- 数据库：SQLite + Prisma（数据量小，单文件零运维；可平滑迁 PostgreSQL）
- AI：阿里云 DashScope `qwen-vl-max-latest`（OpenAI Chat Completion 兼容协议）
- 认证：JWT（localStorage）
- 包管理：pnpm

## 安全设计（核心约束）

- ✅ `QIANWEN_API_KEY` **只在 `backend/.env`**——前端代码、构建产物、git 仓库、URL、日志都不会出现
- ✅ 浏览器调用图像识别走自家后端 `/api/parse-image` 转发，**绝不直连阿里云**
- ✅ AI 解析结果**必须人工确认**才入库（防止识别错误污染数据）
- ✅ 接口响应不包含 Key 字段；诊断页 Authorization 显示为 `Bearer ****`

## 项目结构

```
/
├── backend/              Express API（生产环境同时托管前端构建产物）
│   ├── prisma/schema.prisma   User + Comment
│   ├── src/
│   │   ├── lib/          prisma / auth(JWT) / hash(SHA256)
│   │   ├── services/     ensureAdmin / qianwen / prompt（业务约束）
│   │   └── routes/       auth / debug / parse / comments
│   └── .env.example      复制成 .env 后填 QIANWEN_API_KEY
├── frontend/             Vite + React
│   └── src/
│       ├── pages/        Login / Upload / Confirm / Comments / ManualAdd / Settings / DebugAiTest
│       ├── components/   Layout / RequireAuth / Modal / ReplyModal
│       └── lib/          api / store(zustand) / platform / hash / cn
├── README.md             本文件
├── 试用指南.md           面向非技术使用者的操作手册
├── DEMO.md               cloudflared / ngrok 临时演示链接搭建
├── DEPLOYMENT.md         三种生产部署方案（Vercel+Railway / 阿里云 / Docker）
└── HARDENING.md          上线前生产加固清单（P0 必做项）
```

## 本地开发

前置：Node 20+，pnpm（`npm i -g pnpm`）。

```bash
# 1. 后端
cd backend
cp .env.example .env
# 编辑 .env，填入：
#   QIANWEN_API_KEY=sk-xxxxxxxxxxxxxxxx     ← DashScope 控制台拿
#   JWT_SECRET=$(openssl rand -hex 32)      ← 任意强随机字符串

pnpm install
pnpm prisma migrate dev      # 初始化 SQLite + 自动建 admin/admin123
pnpm dev                     # 后端跑在 http://localhost:3001

# 2. 前端（新终端）
cd frontend
pnpm install
pnpm dev                     # 前端跑在 http://localhost:5173
```

打开 [http://localhost:5173](http://localhost:5173)，用 `admin / admin123` 登录。

> ⚠️ **第一次登录后请立即到"设置"页修改密码**，尤其是要部署到公网之前。

## 关键页面

| 路径 | 用途 |
|---|---|
| `/login` | 登录 |
| `/upload` | 上传截图 |
| `/confirm` | 解析确认（从 upload 跳来） |
| `/comments` | 评论列表（筛选 / 回复 / 批量 / 导出） |
| `/manual-add` | 手动添加（兜底） |
| `/settings` | 修改密码 |
| `/debug/ai-test` | AI 链路诊断（生产建议下线，见 HARDENING.md） |

## API 速查

| 方法 + 路径 | 说明 |
|---|---|
| `POST /api/auth/login` | 登录，返回 JWT |
| `POST /api/auth/change-password` | 修改密码 |
| `POST /api/parse-image` | 多图并发调阿里云解析 |
| `POST /api/comments/batch` | 确认后批量入库（重复跳过） |
| `GET  /api/comments` | 列表 + 筛选 + 分页 |
| `POST /api/comments` | 手动添加单条 |
| `PATCH /api/comments/:id/reply` | 写/改回复 |
| `POST /api/comments/mark-executed` | 单条/批量标记已执行 |
| `GET  /api/comments/export` | 导出 xlsx 清单 |

## 演示 / 部署

- **临时演示链接**：[DEMO.md](./DEMO.md)（cloudflared / ngrok）
- **生产部署**：[DEPLOYMENT.md](./DEPLOYMENT.md)（Vercel+Railway / 阿里云轻量 / Docker）
- **上线前加固**：[HARDENING.md](./HARDENING.md)（P0 必做项）

## 数据存储说明

- 所有数据（账号、评论、回复）存在 SQLite 单文件 `backend/dev.db`（生产建议改名 `prod.db` 并放在持久化目录 / Volume）
- **图片本身不落盘**——上传后只在内存里转 base64 给阿里云，识别完成即丢
- 数据迁移到 PostgreSQL 见 [DEPLOYMENT.md](./DEPLOYMENT.md) 末尾

## 已知限制 / 路线图

- [ ] 图片在上传前本地压缩（节省阿里云 token）
- [ ] 评论软删除（误入库的目前只能 SQL 直删）
- [ ] AI 调用审计日志（图片 hash / 耗时 / token 用量）
- [ ] Prompt 版本化（移到数据库，方便 A/B）
- [ ] 多用户 / 角色（如团队多人协作再加）

## 许可

MIT
