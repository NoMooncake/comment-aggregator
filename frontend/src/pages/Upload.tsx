import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { AI_ERROR_MESSAGES } from '@/lib/errorMessages';

const MAX_FILES = 9;

interface ParseResultItem {
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
  comments?: Array<{
    username: string;
    content: string;
    time_text: string;
    uniqueHash: string;
    alreadyExists: boolean;
  }>;
  rawContent?: string;
  parseError?: string;
}

export default function Upload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter((f) => f.type.startsWith('image/'));
    const next = [...files, ...arr].slice(0, MAX_FILES);
    setFiles(next);
    previews.forEach((u) => URL.revokeObjectURL(u));
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  function removeAt(i: number) {
    const next = files.filter((_, idx) => idx !== i);
    setFiles(next);
    URL.revokeObjectURL(previews[i]);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  async function onSubmit() {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('images', f));
      const { data } = await api.post<{ results: ParseResultItem[] }>('/parse-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate('/confirm', { state: { results: data.results } });
    } catch (e: any) {
      const code = e?.response?.data?.errorCode;
      setError(
        (code && AI_ERROR_MESSAGES[code]) ??
          e?.response?.data?.message ??
          e?.message ??
          '解析失败',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-semibold">上传截图</h1>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center text-sm ${
          dragOver ? 'border-black bg-gray-50' : 'border-gray-300 bg-white'
        }`}
      >
        <p className="font-medium">点击选择 / 拖拽图片到此处</p>
        <p className="mt-1 text-xs text-gray-500">
          一次最多 {MAX_FILES} 张，单张最大 10 MB；手机可直接拍照
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={onPick}
          className="hidden"
        />
      </div>

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-5">
          {previews.map((url, i) => (
            <div key={i} className="relative">
              <img src={url} className="aspect-square w-full rounded-md border object-cover" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
              >
                ×
              </button>
              <div className="mt-1 truncate text-xs text-gray-500">{files[i].name}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={files.length === 0 || loading}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {loading ? `识别中…（${files.length} 张）` : `开始识别（${files.length} 张）`}
        </button>
        {files.length > 0 && (
          <button
            onClick={() => {
              previews.forEach((u) => URL.revokeObjectURL(u));
              setFiles([]);
              setPreviews([]);
            }}
            className="text-sm text-gray-500 hover:underline"
          >
            清空
          </button>
        )}
      </div>
    </div>
  );
}
