import { useState, useRef } from 'react';
import { api } from '@/lib/api';
import { AI_ERROR_MESSAGES } from '@/lib/errorMessages';

interface AiCallDebug {
  image: { filename: string; mimeType: string; sizeBytes: number; base64Length: number };
  request: {
    url: string;
    model: string;
    authorizationMasked: string;
    bodyShape: {
      model: string;
      messages_count: number;
      content_items: Array<{ type: string; image_url_length?: number; text_length?: number }>;
      max_tokens: number;
      temperature: number;
    };
  };
  http: { status: number | null; durationMs: number };
  rawContent: string;
  parsed: any | null;
  parseError: string | null;
}
interface AiCallResponse {
  success: boolean;
  errorCode?: string;
  message?: string;
  parsed?: any;
  debug: AiCallDebug;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-32 shrink-0 text-gray-500">{label}</span>
      <span className="flex-1 break-all font-mono text-xs">{value}</span>
    </div>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-96 overflow-auto rounded bg-gray-50 p-3 font-mono text-xs leading-relaxed">
      {text}
    </pre>
  );
}

export default function DebugAiTest() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiCallResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function onTest() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post<AiCallResponse>('/debug/ai-test', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? '请求失败');
    } finally {
      setLoading(false);
    }
  }

  const debug = result?.debug;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">AI 视觉识别诊断</h1>
        <p className="mt-1 text-sm text-gray-500">
          上传一张评论截图，验证后端 → 阿里云 → 清洗 → 结构化的完整链路。
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
        >
          选择图片
        </button>
        <button
          onClick={onTest}
          disabled={!file || loading}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {loading ? '识别中…' : '测试识别'}
        </button>
        {file && (
          <span className="text-sm text-gray-600">
            {file.name} · {(file.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      {previewUrl && (
        <div className="mb-6">
          <img
            src={previewUrl}
            alt="预览"
            className="max-h-80 rounded-md border border-gray-200"
          />
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && !result.success && result.errorCode && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="font-semibold">
            {result.errorCode} — {AI_ERROR_MESSAGES[result.errorCode] ?? '未知错误'}
          </div>
          {result.message && <div className="mt-1 text-xs">{result.message}</div>}
        </div>
      )}

      {debug && (
        <div className="space-y-4">
          <Section title="① 图片信息">
            <KV label="文件名" value={debug.image.filename} />
            <KV label="MIME" value={debug.image.mimeType} />
            <KV label="大小" value={`${(debug.image.sizeBytes / 1024).toFixed(1)} KB`} />
            <KV label="base64 长度" value={debug.image.base64Length.toLocaleString()} />
          </Section>

          <Section title="② 请求信息（Key 已脱敏）">
            <KV label="URL" value={debug.request.url} />
            <KV label="model" value={debug.request.model} />
            <KV label="Authorization" value={debug.request.authorizationMasked} />
            <KV label="messages 数量" value={debug.request.bodyShape.messages_count} />
            <KV label="max_tokens" value={debug.request.bodyShape.max_tokens} />
            <KV label="temperature" value={debug.request.bodyShape.temperature} />
            <div className="mt-2">
              <div className="mb-1 text-xs text-gray-500">content 数组结构：</div>
              <CodeBlock
                text={JSON.stringify(debug.request.bodyShape.content_items, null, 2)}
              />
            </div>
          </Section>

          <Section title="③ 响应信息">
            <KV label="HTTP 状态码" value={debug.http.status ?? '(未到达)'} />
            <KV label="耗时" value={`${debug.http.durationMs} ms`} />
          </Section>

          <Section title="④ AI 原始返回（content 字符串）">
            <CodeBlock text={debug.rawContent || '(空)'} />
          </Section>

          <Section title="⑤ 清洗后解析结果">
            {debug.parseError && (
              <div className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">
                清洗错误：{debug.parseError}
              </div>
            )}
            {debug.parsed ? (
              <>
                <KV label="平台" value={debug.parsed.platform} />
                <KV label="置信度" value={debug.parsed.platform_confidence} />
                <KV label="判定理由" value={debug.parsed.platform_reason} />
                <KV
                  label="评论数"
                  value={Array.isArray(debug.parsed.comments) ? debug.parsed.comments.length : 0}
                />
                <div className="mt-2">
                  <CodeBlock text={JSON.stringify(debug.parsed, null, 2)} />
                </div>
              </>
            ) : (
              <div className="text-xs text-gray-500">(未成功解析)</div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
