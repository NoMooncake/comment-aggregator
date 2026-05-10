import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { PLATFORM_LABEL, PLATFORM_COLOR, type Platform } from '@/lib/platform';
import { cn } from '@/lib/cn';
import { Filter, Download } from 'lucide-react';
import ReplyModal from '@/components/ReplyModal';

type Status = 'pending' | 'replied' | 'executed';

interface CommentRow {
  id: number;
  platform: Platform;
  userNickname: string;
  content: string;
  commentTimeDisplay: string | null;
  replyContent: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: '待回复',
  replied: '已回复',
  executed: '已执行',
};
const STATUS_STYLE: Record<Status, string> = {
  pending: 'bg-amber-100 text-amber-700',
  replied: 'bg-blue-100 text-blue-700',
  executed: 'bg-gray-200 text-gray-600',
};

const PAGE_SIZE = 20;

export default function Comments() {
  const [params, setParams] = useSearchParams();
  const platform = (params.get('platform') ?? '') as Platform | '';
  const status = (params.get('status') ?? '') as Status | '';
  const page = Number(params.get('page') ?? 1);

  const [items, setItems] = useState<CommentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [filterOpen, setFilterOpen] = useState(false);

  // 选中
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // 回复弹窗
  const [replyTarget, setReplyTarget] = useState<CommentRow | null>(null);

  // 导出
  const [exporting, setExporting] = useState(false);

  // 批量操作的 toast
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    api
      .get<{ items: CommentRow[]; total: number }>('/comments', {
        params: {
          ...(platform ? { platform } : {}),
          ...(status ? { status } : {}),
          page,
          pageSize: PAGE_SIZE,
        },
      })
      .then(({ data }) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.response?.data?.message ?? '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [platform, status, page]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  function setFilter(next: { platform?: Platform | ''; status?: Status | '' }) {
    const p = new URLSearchParams(params);
    if (next.platform !== undefined) {
      next.platform ? p.set('platform', next.platform) : p.delete('platform');
    }
    if (next.status !== undefined) {
      next.status ? p.set('status', next.status) : p.delete('status');
    }
    p.set('page', '1');
    setParams(p);
  }

  function setPage(n: number) {
    const p = new URLSearchParams(params);
    p.set('page', String(n));
    setParams(p);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }
  const allSelected = items.length > 0 && items.every((c) => selected.has(c.id));
  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((c) => c.id)));
    }
  }

  // 在选中里只取 replied 的，能被批量标记已执行
  const selectedReplied = items.filter(
    (c) => selected.has(c.id) && c.status === 'replied',
  );

  async function markExecuted(ids: number[]) {
    if (ids.length === 0) return;
    try {
      const { data } = await api.post<{ updated: number; skipped: number }>(
        '/comments/mark-executed',
        { ids },
      );
      setToast(`已执行 ${data.updated} 条${data.skipped ? `，跳过 ${data.skipped} 条` : ''}`);
      load();
    } catch (e: any) {
      setToast(e?.response?.data?.message ?? '操作失败');
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      const resp = await api.get('/comments/export', { responseType: 'blob' });
      // 从 Content-Disposition 提取后端给的文件名（含日期）
      const dispo = String(resp.headers['content-disposition'] ?? '');
      const m = dispo.match(/filename\*=UTF-8''([^;]+)/);
      const filename = m
        ? decodeURIComponent(m[1])
        : `待执行清单_${new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')}.xlsx`;
      const url = URL.createObjectURL(resp.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast('已导出 Excel');
    } catch (e: any) {
      setToast(e?.response?.data?.message ?? '导出失败');
    } finally {
      setExporting(false);
    }
  }

  function onReplySaved(replyContent: string) {
    if (!replyTarget) return;
    // 局部更新 + 关弹窗，避免整页重载（更顺滑）
    setItems((prev) =>
      prev.map((c) =>
        c.id === replyTarget.id ? { ...c, replyContent, status: 'replied' as Status } : c,
      ),
    );
    setReplyTarget(null);
  }

  const filterChips = (
    <div className="flex flex-wrap gap-2 text-sm">
      <FilterGroup
        label="平台"
        value={platform}
        options={[
          { value: '', label: '全部' },
          { value: 'xiaohongshu', label: '小红书' },
          { value: 'bilibili', label: 'B站' },
          { value: 'video_channel', label: '视频号' },
        ]}
        onChange={(v) => setFilter({ platform: v as Platform | '' })}
      />
      <FilterGroup
        label="状态"
        value={status}
        options={[
          { value: '', label: '全部' },
          { value: 'pending', label: '待回复' },
          { value: 'replied', label: '已回复' },
          { value: 'executed', label: '已执行' },
        ]}
        onChange={(v) => setFilter({ status: v as Status | '' })}
      />
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">评论列表</h1>
          <p className="mt-0.5 text-xs text-gray-500">共 {total} 条</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            disabled={exporting}
            className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={14} />
            <span className="hidden sm:inline">
              {exporting ? '导出中…' : '导出待执行清单'}
            </span>
            <span className="sm:hidden">{exporting ? '…' : '导出'}</span>
          </button>
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm md:hidden"
          >
            <Filter size={14} /> 筛选
          </button>
        </div>
      </div>

      <div className="mb-4 hidden md:block">{filterChips}</div>
      {filterOpen && (
        <div className="mb-4 rounded-md border border-gray-200 bg-white p-3 md:hidden">
          {filterChips}
        </div>
      )}

      {/* 批量操作条 */}
      {items.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            <span>全选本页</span>
          </label>
          <span className="text-gray-500">已选 {selected.size}</span>
          <button
            onClick={() => markExecuted(selectedReplied.map((c) => c.id))}
            disabled={selectedReplied.length === 0}
            className="ml-auto rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
          >
            批量标记已执行（{selectedReplied.length}）
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          没有匹配的评论
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => {
            const isExpanded = expanded[c.id];
            const tooLong = c.content.length > 120;
            return (
              <li
                key={c.id}
                className="rounded-md border border-gray-200 bg-white p-3 md:p-4"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-xs font-medium',
                            PLATFORM_COLOR[c.platform],
                          )}
                        >
                          {PLATFORM_LABEL[c.platform]}
                        </span>
                        <span className="text-sm font-medium">{c.userNickname}</span>
                        {c.commentTimeDisplay && (
                          <span className="text-xs text-gray-500">
                            {c.commentTimeDisplay}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-xs',
                          STATUS_STYLE[c.status],
                        )}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {tooLong && !isExpanded ? c.content.slice(0, 120) + '…' : c.content}
                      {tooLong && (
                        <button
                          onClick={() =>
                            setExpanded((s) => ({ ...s, [c.id]: !isExpanded }))
                          }
                          className="ml-2 text-xs text-blue-600 hover:underline"
                        >
                          {isExpanded ? '收起' : '展开'}
                        </button>
                      )}
                    </p>

                    {c.replyContent && (
                      <div className="mt-2 rounded bg-gray-50 p-2 text-xs">
                        <span className="text-gray-500">我的回复：</span>
                        <span className="whitespace-pre-wrap break-words">
                          {c.replyContent}
                        </span>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-gray-400">
                        入库于 {new Date(c.createdAt).toLocaleString('zh-CN')}
                      </span>
                      <div className="flex gap-2">
                        {c.status === 'pending' && (
                          <button
                            onClick={() => setReplyTarget(c)}
                            className="rounded-md bg-black px-3 py-1 text-xs text-white"
                          >
                            回复
                          </button>
                        )}
                        {c.status === 'replied' && (
                          <>
                            <button
                              onClick={() => setReplyTarget(c)}
                              className="rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                            >
                              编辑回复
                            </button>
                            <button
                              onClick={() => markExecuted([c.id])}
                              className="rounded-md bg-black px-3 py-1 text-xs text-white"
                            >
                              标记已执行
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-gray-600">
            第 {page} / {totalPages} 页
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      <ReplyModal
        open={!!replyTarget}
        commentId={replyTarget?.id ?? null}
        userNickname={replyTarget?.userNickname ?? ''}
        initialReply={replyTarget?.replyContent ?? null}
        onClose={() => setReplyTarget(null)}
        onSaved={onReplySaved}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-black/80 px-4 py-2 text-sm text-white">
          {toast}
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs',
              value === o.value
                ? 'border-black bg-black text-white'
                : 'border-gray-300 bg-white hover:bg-gray-50',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
