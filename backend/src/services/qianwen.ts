import { VISION_PROMPT } from './prompt.js';

export type AiErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH_FAILED'
  | 'AI_RATE_LIMITED'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_RESPONSE'
  | 'AI_UNKNOWN_ERROR';

export interface ParsedComment {
  username: string;
  content: string;
  time_text: string;
}

export interface ParsedResult {
  platform: 'xiaohongshu' | 'video_channel' | 'bilibili' | 'unknown';
  platform_confidence: number;
  platform_reason: string;
  comments: ParsedComment[];
}

export interface AiCallDebug {
  // 1. 图片信息
  image: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    base64Length: number;
  };
  // 2. 请求信息（不含 Key 原文）
  request: {
    url: string;
    model: string;
    authorizationMasked: 'Bearer ****';
    bodyShape: {
      model: string;
      messages_count: number;
      content_items: Array<{ type: string; image_url_length?: number; text_length?: number }>;
      max_tokens: number;
      temperature: number;
    };
  };
  // 3. 响应信息
  http: {
    status: number | null;
    durationMs: number;
  };
  // 4. AI 原始返回字符串（content）
  rawContent: string;
  // 5. 解析结果
  parsed: ParsedResult | null;
  parseError: string | null;
}

export interface AiCallOk {
  success: true;
  parsed: ParsedResult;
  debug: AiCallDebug;
}
export interface AiCallFail {
  success: false;
  errorCode: AiErrorCode;
  message: string;
  debug: AiCallDebug;
}
export type AiCallResult = AiCallOk | AiCallFail;

const TIMEOUT_MS = 30_000;

function cleanResponse(raw: string): { ok: true; data: ParsedResult } | { ok: false; error: string } {
  let s = raw.trim();
  // 去除 ```json 围栏
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // 提取首个完整 {...} 块
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: '响应中找不到 JSON 对象' };
  try {
    const obj = JSON.parse(match[0]) as ParsedResult;
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'JSON 不是对象' };
    if (!Array.isArray(obj.comments)) return { ok: false, error: 'comments 字段缺失或非数组' };
    return { ok: true, data: obj };
  } catch (e) {
    return { ok: false, error: `JSON.parse 失败: ${(e as Error).message}` };
  }
}

export async function callQianwenVision(input: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<AiCallResult> {
  const apiKey = process.env.QIANWEN_API_KEY;
  const endpoint =
    process.env.QIANWEN_ENDPOINT ??
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  const model = process.env.QIANWEN_MODEL ?? 'qwen-vl-max-latest';

  const base64 = input.buffer.toString('base64');
  // 注意：阿里云要求 data:image/{type};base64,{...} 前缀
  const dataUrl = `data:${input.mimeType};base64,${base64}`;

  const debug: AiCallDebug = {
    image: {
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      base64Length: base64.length,
    },
    request: {
      url: endpoint,
      model,
      authorizationMasked: 'Bearer ****',
      bodyShape: {
        model,
        messages_count: 1,
        content_items: [
          { type: 'image_url', image_url_length: dataUrl.length },
          { type: 'text', text_length: VISION_PROMPT.length },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      },
    },
    http: { status: null, durationMs: 0 },
    rawContent: '',
    parsed: null,
    parseError: null,
  };

  if (!apiKey) {
    return {
      success: false,
      errorCode: 'AI_NOT_CONFIGURED',
      message: '后端缺少 QIANWEN_API_KEY 环境变量',
      debug,
    };
  }

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: VISION_PROMPT },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    debug.http.durationMs = Date.now() - t0;
    const err = e as Error;
    if (err.name === 'AbortError') {
      return { success: false, errorCode: 'AI_TIMEOUT', message: '阿里云请求超时（30s）', debug };
    }
    return {
      success: false,
      errorCode: 'AI_UNKNOWN_ERROR',
      message: `网络错误: ${err.message}`,
      debug,
    };
  }
  clearTimeout(timer);
  debug.http.status = resp.status;
  debug.http.durationMs = Date.now() - t0;

  const text = await resp.text();

  if (!resp.ok) {
    debug.rawContent = text;
    if (resp.status === 401 || resp.status === 403) {
      return { success: false, errorCode: 'AI_AUTH_FAILED', message: '阿里云鉴权失败（401/403）', debug };
    }
    if (resp.status === 429) {
      return { success: false, errorCode: 'AI_RATE_LIMITED', message: '阿里云限流（429）', debug };
    }
    return {
      success: false,
      errorCode: 'AI_UNKNOWN_ERROR',
      message: `阿里云返回 HTTP ${resp.status}`,
      debug,
    };
  }

  // 解析 OpenAI 兼容响应
  let outerJson: any;
  try {
    outerJson = JSON.parse(text);
  } catch {
    debug.rawContent = text;
    debug.parseError = '阿里云外层响应不是合法 JSON';
    return { success: false, errorCode: 'AI_INVALID_RESPONSE', message: debug.parseError, debug };
  }

  const content: string | undefined = outerJson?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    debug.rawContent = JSON.stringify(outerJson);
    debug.parseError = 'choices[0].message.content 不存在或非字符串';
    return { success: false, errorCode: 'AI_INVALID_RESPONSE', message: debug.parseError, debug };
  }
  debug.rawContent = content;

  const cleaned = cleanResponse(content);
  if (!cleaned.ok) {
    debug.parseError = cleaned.error;
    return {
      success: false,
      errorCode: 'AI_INVALID_RESPONSE',
      message: `清洗失败: ${cleaned.error}`,
      debug,
    };
  }
  debug.parsed = cleaned.data;
  return { success: true, parsed: cleaned.data, debug };
}
