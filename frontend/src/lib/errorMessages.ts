export const AI_ERROR_MESSAGES: Record<string, string> = {
  AI_NOT_CONFIGURED: '后端未配置 AI API Key（请检查 backend/.env）',
  AI_AUTH_FAILED: 'AI 鉴权失败：API Key 错误或已过期',
  AI_RATE_LIMITED: 'AI 服务限流，请稍后重试',
  AI_TIMEOUT: 'AI 请求超时',
  AI_INVALID_RESPONSE: 'AI 返回内容无法解析',
  AI_UNKNOWN_ERROR: '调用 AI 时发生未知错误',
};
