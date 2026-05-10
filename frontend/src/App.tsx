import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import Login from './pages/Login';
import DebugAiTest from './pages/DebugAiTest';
import Upload from './pages/Upload';
import Confirm from './pages/Confirm';
import Comments from './pages/Comments';
import ManualAdd from './pages/ManualAdd';
import Settings from './pages/Settings';

function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {note && <p className="mt-2 text-sm text-gray-500">{note}</p>}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* 诊断页：本地开发使用，无需登录 */}
      <Route path="/debug/ai-test" element={<DebugAiTest />} />

      {/* 受保护区域 */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/comments" replace />} />
        <Route path="/comments" element={<Comments />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/confirm" element={<Confirm />} />
        <Route path="/manual-add" element={<ManualAdd />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Placeholder title="404" />} />
    </Routes>
  );
}
