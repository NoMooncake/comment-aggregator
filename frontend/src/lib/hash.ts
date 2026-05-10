// 与后端 backend/src/lib/hash.ts 必须保持一致
export function normalizeContent(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export async function commentHash(
  platform: string,
  userNickname: string,
  content: string,
): Promise<string> {
  const key = `${platform}\x01${userNickname.trim()}\x01${normalizeContent(content)}`;
  const buf = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
