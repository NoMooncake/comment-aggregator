import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/store';
import { cn } from '@/lib/cn';
import { LogOut, Menu, X } from 'lucide-react';

const NAV = [
  { to: '/comments', label: '评论列表' },
  { to: '/upload', label: '上传截图' },
  { to: '/manual-add', label: '手动添加' },
];

export default function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="menu"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <Link to="/" className="text-base font-semibold">
              评论聚合管理
            </Link>
          </div>

          <nav className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm hover:bg-gray-100',
                    isActive && 'bg-gray-100 font-medium',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="relative">
            <button
              onClick={() => setUserOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-medium text-white"
              aria-label="user menu"
            >
              {user?.username.slice(0, 1).toUpperCase() ?? '?'}
            </button>
            {userOpen && (
              <div
                className="absolute right-0 mt-2 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-md"
                onMouseLeave={() => setUserOpen(false)}
              >
                <div className="px-3 py-1.5 text-xs text-gray-500">
                  {user?.username ?? '未登录'}
                </div>
                <Link
                  to="/settings"
                  onClick={() => setUserOpen(false)}
                  className="block px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  设置
                </Link>
                <button
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  <LogOut size={14} />
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-gray-200 bg-white md:hidden">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'block px-4 py-3 text-sm border-b border-gray-100',
                    isActive && 'bg-gray-50 font-medium',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl">
        <Outlet />
      </main>
    </div>
  );
}
