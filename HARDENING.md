# 生产加固清单

部署到公网前**必须**完成 P0 项；P1/P2 看时间补。

---

## P0 — 上线前必做

### 1. 修改默认管理员密码

```
账号 admin / admin123 是写死的初始凭据。
绝对不能让公网访问到一个还在用 admin123 的实例。
```

操作：上线后立刻登录 → 设置 → 修改密码 → 用 [1Password 等] 生成 16+ 位强密码并保存。

### 2. JWT_SECRET 用强随机字符串

```bash
# 生成 32 字节随机
openssl rand -hex 32
```

把结果填进生产环境 `JWT_SECRET`，**不要**用 `change-this-to-random-string`、不要复用本地 dev 的 secret。

⚠️ Secret 改动后所有现有 token 失效，需要重新登录——这是预期行为。

### 3. .env 不进 git

```bash
# 验证（应该看不到 .env）
git ls-files | grep -E "\.env$"
```

如果不小心提交过：
```bash
git rm --cached backend/.env
git commit -m "remove .env from tracking"
# 并立即在阿里云控制台 rotate API Key
```

### 4. 阿里云 API Key 权限最小化

DashScope 控制台为这个 Key 单独建子账号 / 子 Key，**只授予** Vision 调用权限，不要用主账号 Key。

### 5. HTTPS

公网必须走 https。三种方式任选：
- 反代层（nginx + Let's Encrypt）
- 平台自带（Vercel / Railway 默认）
- Cloudflare Tunnel

### 6. 关闭 / 保护诊断页（看你部署形态）

`/api/debug/ai-test` 和 `/debug/ai-test` 当前**无需登录**，方便本地排错。
公网部署有两个选择：

**A. 整体下线**（推荐）：
```ts
// backend/src/index.ts，把这行注释
// app.use('/api/debug', debugRoutes);
```
前端的诊断页路由也可同步移除（不移除也只是个无害的 UI）。

**B. 加保护**（你确实想留诊断能力）：
```ts
// backend/src/routes/debug.ts
router.use(requireAuth);   // 在文件顶部加这一行
```
前端再用 `<RequireAuth>` 包一下 `/debug/ai-test` 路由。

---

## P1 — 上线后两周内

### 7. 限流

防止 API Key 被刷、防爆破登录。安装 `express-rate-limit`：

```bash
cd backend && pnpm add express-rate-limit
```

```ts
// backend/src/index.ts
import rateLimit from 'express-rate-limit';

// 全站基本限流
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }));

// 登录单独限流，防爆破
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, max: 10 }));

// 阿里云调用单独限流，省钱
app.use('/api/parse-image', rateLimit({ windowMs: 60_000, max: 20 }));
```

### 8. 上传体积 & 频次双限

当前已限制 10MB/张 × 9 张。再加一层"每分钟最多 20 次解析"（上一条已含）。

### 9. 前端图片本地压缩

阿里云按 token 计费，大图特别贵。前端在 upload 前先用 canvas 压到 ≤ 1600px 宽：

```ts
// 在 frontend/src/lib/imageCompress.ts 新增
export async function compressImage(file: File, maxW = 1600, quality = 0.85): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  if (img.width <= maxW) return file;
  const canvas = document.createElement('canvas');
  const ratio = maxW / img.width;
  canvas.width = maxW;
  canvas.height = Math.round(img.height * ratio);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', quality));
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}
```

在 `Upload.tsx` 的 `addFiles` 里 await 一下。

### 10. 错误日志

生产看不到 console。引入 `pino` 或先简单写文件：

```ts
// 把所有 throw 路径用 try/catch 包住，写到 backend/logs/error-YYYY-MM-DD.log
```

至少要记：
- 阿里云调用失败（含 errorCode、HTTP 状态、耗时）
- 5xx 异常（含 stack）
- 鉴权失败（用于发现爆破）

### 11. 自动备份 SQLite

cron + 异地（对象存储）：

```bash
# /etc/cron.d/comment-backup
0 3 * * * root /opt/scripts/backup-db.sh
```

```bash
# /opt/scripts/backup-db.sh
#!/bin/bash
TS=$(date +%Y-%m-%d_%H%M)
sqlite3 /opt/comment-aggregator/backend/prod.db ".backup /tmp/db-$TS.db"
# 上传到 OSS / S3 / R2
ossutil cp /tmp/db-$TS.db oss://your-bucket/backups/
rm /tmp/db-$TS.db
```

`sqlite3 .backup` 比 `cp` 安全——它做事务一致快照，不会读到写到一半的页。

---

## P2 — 用一段时间后再考虑

### 12. 软删除评论

当前没法在 UI 删评论（误入库的只能 SQL 直删）。补 schema：

```prisma
model Comment {
  // ...
  deletedAt DateTime?
  @@index([deletedAt])
}
```

加 DELETE 接口，列表查询 `where: { deletedAt: null }`。

### 13. Prompt 版本化

把附录A的 prompt 从 `services/prompt.ts` 常量挪到数据库 `Setting` 表，加个版本字段。改 prompt 不用重新部署，且能 A/B 测试。

### 14. 多用户 / 角色

当前是单用户。如果团队多人协作（你 + 助手 + 老板），按需要加：
- `User.role` 字段（admin / editor / viewer）
- 评论加 `assignedTo` 谁负责回复
- 操作日志（谁标记的已执行）

### 15. AI 调用审计

落库每次 `parse-image` 调用：图片 hash、耗时、token 用量、成本。观察 prompt 变化对成本的影响。

### 16. CSP / 安全 header

加 `helmet`：

```bash
cd backend && pnpm add helmet
```

```ts
import helmet from 'helmet';
app.use(helmet({ contentSecurityPolicy: false })); // CSP 单独定义
```

### 17. 监控

- uptime：[uptimerobot.com](https://uptimerobot.com) 免费 ping `/api/health`
- 应用错误：Sentry 免费 quota 够单人项目
- AI 成本：阿里云控制台账单告警

---

## 已知不做的事

下面这些事**故意不做**（不是漏了），如果未来要做要先想清楚理由：

- **多设备 token 撤销** —— 单用户系统，密码改了就全部失效已经够了
- **二次验证** —— 单人系统过度
- **CSRF token** —— JWT 走 Authorization header（不是 Cookie），天然没有 CSRF
- **国际化** —— 全站中文写死
- **暗色模式** —— 跟工作流无关

---

## 安全 self-check（每月跑一次）

```bash
# 1. 是否还在用默认密码？
# 登录页用 admin/admin123 试，应该失败。

# 2. .env 是否在 git 里？
git ls-files | grep '\.env$' && echo "❌ 泄露" || echo "✅ ok"

# 3. JWT_SECRET 强度？
node -e "console.log(process.env.JWT_SECRET?.length)"  # 应 >= 32

# 4. 备份是否在跑？
ls -lt /opt/backups/ | head      # 最新一份是今早凌晨

# 5. 阿里云 token 用量异常？
# 阿里云控制台 → 账单详情看 qwen-vl-max-latest 调用量
```
