import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import debugRoutes from './routes/debug.js';
import parseRoutes from './routes/parse.js';
import commentRoutes from './routes/comments.js';
import { ensureAdmin } from './services/ensureAdmin.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/api/auth', authRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/parse-image', parseRoutes);
app.use('/api/comments', commentRoutes);

// 生产 / 单端口演示模式：托管前端构建产物（如果存在）
// dev 模式下 frontend/dist 不存在，这段被跳过；前端走 vite :5173 + /api 代理
const FRONTEND_DIST = path.resolve(import.meta.dirname, '../../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA 回退：任何非 /api 路径返回 index.html
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
  console.log(`[backend] serving frontend from ${FRONTEND_DIST}`);
} else {
  console.log('[backend] frontend/dist 不存在，跳过静态托管（dev 模式正常）');
}

const port = Number(process.env.PORT ?? 3001);

async function start() {
  await ensureAdmin();
  app.listen(port, () => {
    console.log(`[backend] listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error('[backend] failed to start:', err);
  process.exit(1);
});
