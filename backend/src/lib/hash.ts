import { createHash } from 'node:crypto';

// uniqueHash = SHA256(platform + userNickname + content.trim())
// content 比对时去除首尾空格和多余空白（多个空白合并为一个）
export function normalizeContent(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function commentHash(platform: string, userNickname: string, content: string): string {
  const key = `${platform}\x01${userNickname.trim()}\x01${normalizeContent(content)}`;
  return createHash('sha256').update(key, 'utf8').digest('hex');
}
