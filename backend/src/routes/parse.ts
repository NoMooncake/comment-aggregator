import { Router } from 'express';
import multer from 'multer';
import { callQianwenVision } from '../services/qianwen.js';
import { commentHash } from '../lib/hash.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB / 张
    files: 9,
  },
});

// POST /api/parse-image
// 多图并发调用阿里云。要求登录。
// 入参：multipart/form-data，字段名 images（多文件）
// 出参：{ results: [{ filename, success, errorCode?, message?, parsed?, durationMs, httpStatus, debug? }] }
router.post('/', requireAuth, upload.array('images', 9), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'NO_FILES', message: '请上传 images 字段' });
  }

  // 并发调阿里云
  const aiResults = await Promise.all(
    files.map((f) =>
      callQianwenVision({
        filename: f.originalname,
        mimeType: f.mimetype || 'image/png',
        buffer: f.buffer,
      }),
    ),
  );

  // 收集所有解析出来的 hash，一次查询 DB 是否已存在
  const allHashes: string[] = [];
  for (const r of aiResults) {
    if (r.success) {
      for (const c of r.parsed.comments) {
        allHashes.push(commentHash(r.parsed.platform, c.username, c.content));
      }
    }
  }
  const existingRows = allHashes.length
    ? await prisma.comment.findMany({
        where: { uniqueHash: { in: allHashes } },
        select: { uniqueHash: true },
      })
    : [];
  const existingSet = new Set(existingRows.map((r) => r.uniqueHash));

  const results = aiResults.map((r, i) => {
    const f = files[i];
    const base = {
      filename: f.originalname,
      sizeBytes: f.size,
      durationMs: r.debug.http.durationMs,
      httpStatus: r.debug.http.status,
    };
    if (!r.success) {
      return {
        ...base,
        success: false as const,
        errorCode: r.errorCode,
        message: r.message,
        rawContent: r.debug.rawContent,
        parseError: r.debug.parseError,
      };
    }
    const platform = r.parsed.platform;
    const comments = r.parsed.comments.map((c) => {
      const h = commentHash(platform, c.username, c.content);
      return {
        username: c.username,
        content: c.content,
        time_text: c.time_text,
        uniqueHash: h,
        alreadyExists: existingSet.has(h),
      };
    });
    return {
      ...base,
      success: true as const,
      platform,
      platform_confidence: r.parsed.platform_confidence,
      platform_reason: r.parsed.platform_reason,
      comments,
      rawContent: r.debug.rawContent,
    };
  });

  res.json({ results });
});

export default router;
