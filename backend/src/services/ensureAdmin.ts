import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';

export async function ensureAdmin(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { username: DEFAULT_USERNAME } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await prisma.user.create({
    data: { username: DEFAULT_USERNAME, passwordHash },
  });
  console.log(
    `[init] 已创建默认管理员账号 ${DEFAULT_USERNAME} / ${DEFAULT_PASSWORD}（请尽快通过设置页修改密码）`,
  );
}
