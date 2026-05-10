export const AI_ERROR_MESSAGES: Record<string, string> = {
  AI_NOT_CONFIGURED: '后端未配置阿里云 API Key（请检查 backend/.env）',
  AI_AUTH_FAILED: '阿里云鉴权失败：API Key 错误或已过期',
  AI_RATE_LIMITED: '阿里云限流，请稍后重试',
  AI_TIMEOUT: '阿里云请求超时（30 秒）',
  AI_INVALID_RESPONSE: 'AI 返回内容无法解析',
  AI_UNKNOWN_ERROR: '调用 AI 时发生未知错误',
};
