import { Router } from 'express';
import multer from 'multer';
import { callQianwenVision } from '../services/qianwen.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// POST /api/debug/ai-test
// 阶段2：诊断专用。不要求登录，仅本地开发使用。
// 入参：multipart/form-data，字段名 image
// 出参：{ success, parsed?, errorCode?, message?, debug }
router.post('/ai-test', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE', message: '请上传 image 字段' });
  }
  const result = await callQianwenVision({
    filename: req.file.originalname,
    mimeType: req.file.mimetype || 'image/png',
    buffer: req.file.buffer,
  });
  res.json(result);
});

export default router;
