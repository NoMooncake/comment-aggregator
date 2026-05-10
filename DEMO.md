# 临时演示（cloudflared 隧道）

把本地服务暴露成一个 https 临时链接，给同事 / 领导试用。**电脑关掉链接就失效**。

## 一次性准备

```bash
# 安装 cloudflared
brew install cloudflared

# 验证
cloudflared --version
```

## 三步起 demo

### 1. 构建前端（一次即可，代码改了再 build）

```bash
cd "/Users/daviewu/Study/me/“评论聚合”网站/frontend"
pnpm build
# 产物在 frontend/dist/
```

### 2. 启动后端（生产模式）

```bash
cd "/Users/daviewu/Study/me/“评论聚合”网站/backend"
pnpm build         # 编译 TS → dist/
NODE_ENV=production pnpm start
```

启动日志应包含：

```
[backend] serving frontend from .../frontend/dist
[backend] listening on http://localhost:3001
```

浏览器打开 [http://localhost:3001](http://localhost:3001) 验证：能登录、能用，**只走 3001 一个端口**（不再需要 vite 5173）。

### 3. 起 cloudflared 隧道

新开一个终端：

```bash
cloudflared tunnel --url http://localhost:3001
```

输出里会看到一行类似：

```
Your quick Tunnel has been created! Visit it at:
https://random-name-abc-123.trycloudflare.com
```

**这个 URL 就是发给领导的链接。**

## 演示前检查清单

- [ ] `backend/.env` 里 `QIANWEN_API_KEY` 已填，且**不在 git 仓库里**
- [ ] 用 admin/admin123 能登录
- [ ] 上传一张真截图，识别成功
- [ ] 列表能打开、能写回复、能导出 Excel
- [ ] cloudflared 终端没有报错
- [ ] **演示完关掉终端**（Ctrl+C 关 cloudflared，链接立即失效）

## 几个坑预先避一下

1. **cloudflared 链接 30 分钟没流量会回收** — 演示前提前打开预热一下。
2. **多人同时操作同一个 admin 账号** — 当前是单用户系统，互相会看到对方动作。如要多人独立测试，临时给每人改一个独立密码。
3. **你的电脑休眠 = 链接挂了** — 演示期间设个"防休眠"（macOS 用 `caffeinate`）：
   ```bash
   caffeinate -d &  # 阻止屏幕休眠，演示完 fg 然后 Ctrl+C
   ```
4. **域名首次访问 cloudflare 会跳验证页** — 正常，点过即可。
5. **vite dev 走 cloudflared 会卡** — 不要走 dev 模式，走第 1+2 步的生产构建。

## 演示完之后

```bash
# 终端里 Ctrl+C 关掉 cloudflared
# Ctrl+C 关掉后端
# 链接立即失效，你的 API Key、数据库都还在本地，没泄露
```
