import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { commentHash } from '@/lib/hash';
import { PLATFORM_OPTIONS, PLATFORM_LABEL, type Platform } from '@/lib/platform';
import { AI_ERROR_MESSAGES } from '@/lib/errorMessages';

interface IncomingComment {
  username: string;
  content: string;
  time_text: string;
  uniqueHash: string;
  alreadyExists: boolean;
}
interface IncomingResult {
  filename: string;
  sizeBytes: number;
  durationMs: number;
  httpStatus: number | null;
  success: boolean;
  errorCode?: string;
  message?: string;
  platform?: string;
  platform_confidence?: number;
  platform_reason?: string;
  comments?: IncomingComment[];
  rawContent?: string;
  parseError?: string;
}

interface Row {
  // 一行 = 一条评论
  imageIdx: number;
  filename: string;
  selected: boolean;
  platform: '' | Platform; // unknown 时为空，强制用户选
  username: string;
  content: string;
  timeText: string;
  originalHash: string;     // 阿里云首次返回时算的 hash
  originalAlreadyExists: boolean;
  currentHash: string;      // 跟随编辑变化
  currentAlreadyExists: boolean; // 当 currentHash 等于 DB 中已知 hash 时为 true
}

export default function Confirm() {
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = (location.state as { results?: IncomingResult[] } | null)?.results;
  const [showDebug, setShowDebug] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  // 已知"原本已存在"的 hash 集合（用于编辑后回退判断）
  const knownExistingHashes = useMemo(() => {
    const s = new Set<string>();
    incoming?.forEach((r) => r.comments?.forEach((c) => c.alreadyExists && s.add(c.uniqueHash)));
    return s;
  }, [incoming]);

  const [rows, setRows] = useState<Row[]>(() => {
    if (!incoming) return [];
    const out: Row[] = [];
    incoming.forEach((r, i) => {
      if (!r.success || !r.comments) return;
      const platform =
        r.platform === 'xiaohongshu' || r.platform === 'video_channel' || r.platform === 'bilibili'
          ? (r.platform as Platform)
          : '';
      r.comments.forEach((c) => {
        out.push({
          imageIdx: i,
          filename: r.filename,
          selected: !c.alreadyExists, // 已存在的默认不勾
          platform,
          username: c.username,
          content: c.content,
          timeText: c.time_text,
          originalHash: c.uniqueHash,
          originalAlreadyExists: c.alreadyExists,
          currentHash: c.uniqueHash,
          currentAlreadyExists: c.alreadyExists,
        });
      });
    });
    return out;
  });

  // 编辑后异步重算 currentHash
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tasks = rows.map(async (r) => {
        if (!r.platform) return null;
        const h = await commentHash(r.platform, r.username, r.content);
        return { h, exists: knownExistingHashes.has(h) };
      });
      const results = await Promise.all(tasks);
      if (cancelled) return;
      setRows((prev) =>
        prev.map((r, i) => {
          const v = results[i];
          if (!v) {
            return { ...r, currentHash: '', currentAlreadyExists: false };
          }
          if (v.h === r.currentHash && v.exists === r.currentAlreadyExists) return r;
          return { ...r, currentHash: v.h, currentAlreadyExists: v.exists };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // 依赖：会改变 hash 的字段
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rows.map((r) => `${r.platform}|${r.username}|${r.content}`).join('§'),
    knownExistingHashes,
  ]);

  if (!incoming) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">未找到解析结果。请先到上传页。</p>
        <button
          onClick={() => navigate('/upload')}
          className="mt-3 rounded-md bg-black px-3 py-1.5 text-sm text-white"
        >
          去上传
        </button>
      </div>
    );
  }

  function update(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  function toggleAll() {
    const next = !allSelected;
    setRows((prev) => prev.map((r) => ({ ...r, selected: next })));
  }

  // 前端校验：勾选行必须有 platform、username、content
  const invalidSelected = rows.some(
    (r) => r.selected && (!r.platform || !r.username.trim() || !r.content.trim()),
  );

  async function onConfirm() {
    setError(null);
    if (invalidSelected) {
      setError('勾选的行中有缺失字段（平台/昵称/内容必填）');
      return;
    }
    const items = rows
      .filter((r) => r.selected)
      .map((r) => ({
        platform: r.platform as Platform,
        userNickname: r.username,
        content: r.content,
        commentTimeDisplay: r.timeText,
      }));
    if (items.length === 0) {
      setError('请至少勾选一条');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<{ inserted: number; skipped: number }>(
        '/comments/batch',
        { items },
      );
      setDone(data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? '入库失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          入库完成：新增 <strong>{done.inserted}</strong> 条，跳过重复{' '}
          <strong>{done.skipped}</strong> 条。
        </div>
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => navigate('/comments')}
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            去评论列表
          </button>
          <button
            onClick={() => navigate('/upload')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm"
          >
            继续上传
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-semibold">解析结果确认</h1>
      <p className="mt-1 text-xs text-gray-500">
        AI 解析结果不会自动入库；请校对后勾选并提交。
      </p>

      {/* 调试信息 */}
      <div className="mt-4">
        <button
          onClick={() => setShowDebug((v) => !v)}
          className="text-xs text-gray-500 underline"
        >
          {showDebug ? '隐藏' : '展开'}调试信息（{incoming.length} 张）
        </button>
        {showDebug && (
          <div className="mt-2 space-y-2">
            {incoming.map((r, i) => (
              <div
                key={i}
                className="rounded-md border border-gray-200 bg-white p-3 text-xs"
              >
                <div className="flex flex-wrap gap-3">
                  <span className="font-medium">{r.filename}</span>
                  <span>HTTP {r.httpStatus ?? '-'}</span>
                  <span>{r.durationMs} ms</span>
                  {r.success ? (
                    <>
                      <span>平台: {r.platform}</span>
                      <span>置信度: {r.platform_confidence}</span>
                      <span>评论数: {r.comments?.length ?? 0}</span>
                    </>
                  ) : (
                    <span className="text-red-600">
                      {r.errorCode}: {r.message}
                    </span>
                  )}
                </div>
                {r.platform_reason && (
                  <div className="mt-1 text-gray-500">理由: {r.platform_reason}</div>
                )}
                {r.rawContent && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-gray-500">原始返回</summary>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-gray-50 p-2 font-mono">
                      {r.rawContent}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 失败的图单独提示 */}
      {incoming.some((r) => !r.success) && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {incoming
            .filter((r) => !r.success)
            .map((r, i) => (
              <div key={i}>
                <strong>{r.filename}</strong>：{r.errorCode}（
                {AI_ERROR_MESSAGES[r.errorCode ?? ''] ?? r.message}）
              </div>
            ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-6 rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          没有可入库的评论。
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span>全选 / 反选</span>
            </label>
            <span className="text-gray-500">
              共 {rows.length} 条，已勾选 {rows.filter((r) => r.selected).length}
            </span>
          </div>

          {/* PC 表格 */}
          <div className="mt-3 hidden overflow-x-auto rounded-md border border-gray-200 bg-white md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="w-10 p-2"></th>
                  <th className="w-32 p-2">平台</th>
                  <th className="w-40 p-2">用户昵称</th>
                  <th className="p-2">评论内容</th>
                  <th className="w-44 p-2">时间原文</th>
                  <th className="w-32 p-2">来源图</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-t border-gray-100 ${
                      r.currentAlreadyExists ? 'bg-gray-50 text-gray-400' : ''
                    }`}
                  >
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => update(i, { selected: e.target.checked })}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <select
                        value={r.platform}
                        onChange={(e) =>
                          update(i, { platform: e.target.value as Platform | '' })
                        }
                        className={`w-full rounded border px-1.5 py-1 text-xs ${
                          r.platform ? 'border-gray-300' : 'border-red-400'
                        }`}
                      >
                        <option value="">请选择</option>
                        {PLATFORM_OPTIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 align-top">
                      <input
                        value={r.username}
                        onChange={(e) => update(i, { username: e.target.value })}
                        className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <textarea
                        value={r.content}
                        onChange={(e) => update(i, { content: e.target.value })}
                        rows={2}
                        className="w-full resize-y rounded border border-gray-300 px-1.5 py-1 text-xs"
                      />
                      {r.currentAlreadyExists && (
                        <div className="mt-1 text-xs text-amber-600">已存在，将跳过</div>
                      )}
                    </td>
                    <td className="p-2 align-top">
                      <input
                        value={r.timeText}
                        onChange={(e) => update(i, { timeText: e.target.value })}
                        className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="truncate p-2 align-top text-xs text-gray-500">{r.filename}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 手机卡片 */}
          <div className="mt-3 space-y-2 md:hidden">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`rounded-md border bg-white p-3 ${
                  r.currentAlreadyExists ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={r.selected}
                    onChange={(e) => update(i, { selected: e.target.checked })}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <select
                      value={r.platform}
                      onChange={(e) => update(i, { platform: e.target.value as Platform | '' })}
                      className={`w-full rounded border px-2 py-1 text-sm ${
                        r.platform ? 'border-gray-300' : 'border-red-400'
                      }`}
                    >
                      <option value="">请选择平台</option>
                      {PLATFORM_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={r.username}
                      onChange={(e) => update(i, { username: e.target.value })}
                      placeholder="用户昵称"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <textarea
                      value={r.content}
                      onChange={(e) => update(i, { content: e.target.value })}
                      placeholder="评论内容"
                      rows={3}
                      className="w-full resize-y rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <input
                      value={r.timeText}
                      onChange={(e) => update(i, { timeText: e.target.value })}
                      placeholder="时间原文"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="truncate">来源：{r.filename}</span>
                      {r.currentAlreadyExists && <span className="text-amber-600">已存在</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 p-3 backdrop-blur md:relative md:border-0 md:bg-transparent md:p-0">
        <span className="text-xs text-gray-500">
          {invalidSelected ? '勾选行有缺失字段' : '检查无误后点击确认入库'}
        </span>
        <button
          onClick={onConfirm}
          disabled={submitting || invalidSelected || rows.filter((r) => r.selected).length === 0}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {submitting ? '入库中…' : '确认入库'}
        </button>
      </div>
    </div>
  );
}
