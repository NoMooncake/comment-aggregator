import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  commentId: number | null;
  userNickname: string;
  initialReply: string | null;
  onClose: () => void;
  onSaved: (replyContent: string) => void;
}

export default function ReplyModal({
  open,
  commentId,
  userNickname,
  initialReply,
  onClose,
  onSaved,
}: Props) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText(initialReply ?? '');
      setError(null);
    }
  }, [open, initialReply]);

  async function onSave() {
    if (!commentId || !text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/comments/${commentId}/reply`, { replyContent: text.trim() });
      onSaved(text.trim());
    } catch (e: any) {
      setError(e?.response?.data?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`回复给 ${userNickname}`}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving || !text.trim()}
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        autoFocus
        placeholder="输入回复内容…"
        className="w-full resize-y rounded-md border border-gray-300 p-3 text-sm outline-none focus:border-black"
      />
      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </Modal>
  );
}
