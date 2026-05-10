import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/store';

export default function Settings() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const valid =
    oldPassword.length > 0 &&
    newPassword.length >= 6 &&
    newPassword === confirmPassword;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    setDone(false);
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      setDone(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // 修改成功后退出登录，强制用新密码重登
      setTimeout(() => {
        logout();
        navigate('/login', { replace: true });
      }, 1500);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? '修改失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-xl font-semibold">设置</h1>
      <p className="mb-4 text-xs text-gray-500">当前账号：{user?.username ?? '-'}</p>

      <form
        onSubmit={onSubmit}
        className="max-w-md space-y-4 rounded-md border border-gray-200 bg-white p-4 md:p-5"
      >
        <h2 className="text-sm font-semibold">修改密码</h2>

        <label className="block">
          <span className="text-sm text-gray-700">旧密码</span>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-700">新密码（至少 6 位）</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-700">确认新密码</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {confirmPassword.length > 0 && confirmPassword !== newPassword && (
            <span className="mt-1 block text-xs text-red-600">两次密码不一致</span>
          )}
        </label>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-700">
            密码修改成功，即将跳转到登录页…
          </div>
        )}

        <button
          type="submit"
          disabled={!valid || submitting}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {submitting ? '提交中…' : '修改密码'}
        </button>
      </form>
    </div>
  );
}
