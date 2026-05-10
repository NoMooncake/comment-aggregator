import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { PLATFORM_OPTIONS, type Platform } from '@/lib/platform';

export default function ManualAdd() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<Platform | ''>('');
  const [userNickname, setUserNickname] = useState('');
  const [content, setContent] = useState('');
  const [commentTimeDisplay, setCommentTimeDisplay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const valid = platform && userNickname.trim() && content.trim();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    setDone(null);
    try {
      await api.post('/comments', {
        platform,
        userNickname: userNickname.trim(),
        content: content.trim(),
        commentTimeDisplay: commentTimeDisplay.trim() || null,
      });
      setDone('已添加');
      setUserNickname('');
      setContent('');
      setCommentTimeDisplay('');
    } catch (e: any) {
      const code = e?.response?.data?.error;
      if (code === 'DUPLICATE') {
        setError('该评论已存在（按 平台+昵称+内容 判定重复）');
      } else {
        setError(e?.response?.data?.message ?? '添加失败');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-xl font-semibold">手动添加评论</h1>
      <p className="mb-4 text-xs text-gray-500">
        AI 没识别上、或不方便上传截图时使用。提交后直接入库。
      </p>

      <form
        onSubmit={onSubmit}
        className="max-w-xl space-y-4 rounded-md border border-gray-200 bg-white p-4 md:p-5"
      >
        <label className="block">
          <span className="text-sm text-gray-700">来源平台 *</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | '')}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">请选择</option>
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-gray-700">用户昵称 *</span>
          <input
            value={userNickname}
            onChange={(e) => setUserNickname(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-700">评论内容 *</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="mt-1 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-700">时间原文（可选）</span>
          <input
            value={commentTimeDisplay}
            onChange={(e) => setCommentTimeDisplay(e.target.value)}
            placeholder="如：2小时前 江苏 / 1月23日 广东"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-700">
            {done}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!valid || submitting}
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {submitting ? '提交中…' : '添加'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/comments')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm"
          >
            去列表查看
          </button>
        </div>
      </form>
    </div>
  );
}
