import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { commentHash, normalizeContent } from '../lib/hash.js';

const PLATFORM_LABEL_CN: Record<string, string> = {
  xiaohongshu: '小红书',
  bilibili: 'B站',
  video_channel: '视频号',
};

const router = Router();
router.use(requireAuth);

const PLATFORMS = ['xiaohongshu', 'video_channel', 'bilibili'] as const;
const STATUSES = ['pending', 'replied', 'executed'] as const;

const listQuerySchema = z.object({
  platform: z.enum(PLATFORMS).optional(),
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/comments?platform=&status=&page=&pageSize=
router.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: parsed.error.issues[0]?.message ?? '参数错误',
    });
  }
  const { platform, status, page, pageSize } = parsed.data;
  const where = {
    ...(platform ? { platform } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.comment.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

const batchItemSchema = z.object({
  platform: z.enum(PLATFORMS),
  userNickname: z.string().min(1),
  content: z.string().min(1),
  commentTimeDisplay: z.string().optional().nullable(),
});
const batchSchema = z.object({
  items: z.array(batchItemSchema).min(1).max(200),
});

// POST /api/comments/batch
// 解析确认页"确认入库"调用。重复项静默跳过。
router.post('/batch', async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: parsed.error.issues[0]?.message ?? '参数错误',
    });
  }

  let inserted = 0;
  let skipped = 0;

  for (const it of parsed.data.items) {
    const userNickname = it.userNickname.trim();
    const content = normalizeContent(it.content);
    const hash = commentHash(it.platform, userNickname, content);
    try {
      await prisma.comment.create({
        data: {
          platform: it.platform,
          userNickname,
          content,
          commentTimeDisplay: it.commentTimeDisplay?.trim() || null,
          uniqueHash: hash,
        },
      });
      inserted++;
    } catch (e: any) {
      // P2002 = unique constraint violation
      if (e?.code === 'P2002') {
        skipped++;
      } else {
        throw e;
      }
    }
  }

  res.json({ inserted, skipped });
});

// POST /api/comments
// 手动添加一条评论（手动添加页 / 兜底入口）
const manualSchema = z.object({
  platform: z.enum(PLATFORMS),
  userNickname: z.string().min(1, '用户昵称必填'),
  content: z.string().min(1, '评论内容必填'),
  commentTimeDisplay: z.string().optional().nullable(),
});

router.post('/', async (req, res) => {
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: parsed.error.issues[0]?.message ?? '参数错误',
    });
  }
  const it = parsed.data;
  const userNickname = it.userNickname.trim();
  const content = normalizeContent(it.content);
  const hash = commentHash(it.platform, userNickname, content);
  try {
    const created = await prisma.comment.create({
      data: {
        platform: it.platform,
        userNickname,
        content,
        commentTimeDisplay: it.commentTimeDisplay?.trim() || null,
        uniqueHash: hash,
      },
    });
    res.json({ ok: true, comment: created });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: 'DUPLICATE', message: '该评论已存在' });
    }
    throw e;
  }
});

// PATCH /api/comments/:id/reply
// 写/改回复内容；pending → replied；已 executed 不允许改
const replySchema = z.object({
  replyContent: z.string().min(1, '回复内容不能为空'),
});

router.patch('/:id/reply', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'id 非法' });
  }
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: parsed.error.issues[0]?.message ?? '参数错误',
    });
  }
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'NOT_FOUND', message: '评论不存在' });
  }
  if (existing.status === 'executed') {
    return res.status(400).json({
      error: 'INVALID_STATE',
      message: '已执行的评论不能修改回复',
    });
  }
  const updated = await prisma.comment.update({
    where: { id },
    data: {
      replyContent: parsed.data.replyContent.trim(),
      status: 'replied',
    },
  });
  res.json({ comment: updated });
});

// POST /api/comments/mark-executed
// 单条/批量标记已执行；只允许 replied → executed
const markExecutedSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

router.post('/mark-executed', async (req, res) => {
  const parsed = markExecutedSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      message: parsed.error.issues[0]?.message ?? '参数错误',
    });
  }
  const result = await prisma.comment.updateMany({
    where: { id: { in: parsed.data.ids }, status: 'replied' },
    data: { status: 'executed' },
  });
  res.json({ updated: result.count, skipped: parsed.data.ids.length - result.count });
});

// GET /api/comments/export
// 导出"待执行清单"——所有 status=replied 的评论
router.get('/export', async (_req, res) => {
  const rows = await prisma.comment.findMany({
    where: { status: 'replied' },
    orderBy: { createdAt: 'desc' },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('待执行清单');

  ws.columns = [
    { header: '来源平台', key: 'platform', width: 12 },
    { header: '用户昵称', key: 'nickname', width: 20 },
    { header: '原评论内容', key: 'content', width: 60 },
    { header: '评论时间', key: 'time', width: 18 },
    { header: '我的回复内容', key: 'reply', width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };

  for (const r of rows) {
    ws.addRow({
      platform: PLATFORM_LABEL_CN[r.platform] ?? r.platform,
      nickname: r.userNickname,
      content: r.content,
      time: r.commentTimeDisplay ?? '',
      reply: r.replyContent ?? '',
    });
  }
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `待执行清单_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );

  const buffer = await wb.xlsx.writeBuffer();
  res.end(Buffer.from(buffer));
});

export default router;
