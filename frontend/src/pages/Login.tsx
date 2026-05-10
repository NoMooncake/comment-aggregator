import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/store';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuth((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/comments';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ token: string; user: { id: number; username: string } }>(
        '/auth/login',
        { username, password },
      );
      setAuth(data.token, data.user);
      navigate(from, { replace: true });
    } catch (e: any) {
      setError(e?.response?.data?.message ?? '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold">评论聚合管理</h1>
          <p className="mt-1 text-xs text-gray-500">默认账号 admin / admin123</p>
        </div>

        <label className="block">
          <span className="text-sm text-gray-700">账号</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
            autoComplete="username"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-700">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full rounded-md bg-black py-2 text-sm text-white disabled:opacity-40"
        >
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
