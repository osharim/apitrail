import { useEffect, useMemo, useState } from 'react'
import { type TraceDetail as TraceDetailData, api } from '../lib/api'
import { fmtDuration } from '../lib/format'
import { MethodBadge, StatusBadge } from './Badge'
import { Waterfall } from './Waterfall'

interface Props {
  traceId: string | null
  onClose: () => void
}

type Tab = 'request' | 'response'

export function TraceDetail({ traceId, onClose }: Props) {
  const [data, setData] = useState<TraceDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('response')

  useEffect(() => {
    if (!traceId) {
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setTab('response')
    api
      .trace(traceId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [traceId])

  // Best-effort extraction of the logged-in user from common headers.
  const userHint = useMemo(() => {
    if (!data?.root) return null
    const h = data.root.req_headers ?? {}
    const uid =
      h['x-user-id'] || h['x-user'] || h['x-auth-user'] || pickFromCookieUser(h.cookie || '')
    return uid || null
  }, [data])

  if (!traceId) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-3xl flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.1em] text-neutral-500">
            Request
          </div>
          <div className="font-mono text-xs text-neutral-500">{traceId.slice(0, 8)}…</div>
          {userHint ? (
            <div
              className="flex items-center gap-1 rounded-md border border-violet-900/50 bg-violet-950/40 px-1.5 py-0.5 font-mono text-[10px] text-violet-300"
              title={`Logged-in user hint: ${userHint}`}
            >
              <span className="opacity-60">user</span>
              <span>{userHint.slice(0, 14)}</span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
          aria-label="Close detail"
        >
          Close ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
            Loading…
          </div>
        ) : error ? (
          <div className="rounded-md border border-rose-900/60 bg-rose-950/30 p-3 text-sm text-rose-300">
            {error}
          </div>
        ) : data?.root ? (
          <div className="flex flex-col gap-5">
            {data.root.error_message ? (
              <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-3 text-sm">
                <div className="font-semibold text-rose-300">{data.root.error_message}</div>
                {data.root.error_stack ? (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-rose-400/80">
                    {data.root.error_stack}
                  </pre>
                ) : null}
              </div>
            ) : null}

            {/* Summary line */}
            <section>
              <div className="mb-3 flex items-center gap-3">
                <MethodBadge method={data.root.method} />
                <span className="font-mono text-base font-medium text-neutral-100">
                  {data.root.path}
                </span>
                <StatusBadge code={data.root.status_code} />
                <span className="ml-auto font-mono text-xs text-neutral-400 tabular">
                  {fmtDuration(Number(data.root.duration_ms))}
                </span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <MetaRow label="trace_id" value={data.root.trace_id} copyable />
                <MetaRow label="span_id" value={data.root.span_id} copyable />
                <MetaRow label="route" value={data.root.route ?? '—'} />
                <MetaRow label="runtime" value={data.root.runtime} />
                <MetaRow label="host" value={data.root.host ?? '—'} />
                <MetaRow label="client_ip" value={data.root.client_ip ?? '—'} />
                <MetaRow label="user_agent" value={data.root.user_agent ?? '—'} truncate />
                <MetaRow label="referer" value={data.root.referer ?? '—'} />
                <MetaRow label="started" value={new Date(data.root.start_time).toISOString()} />
                {userHint ? <MetaRow label="user (hint)" value={userHint} copyable /> : null}
              </dl>
            </section>

            {/* Waterfall */}
            <section>
              <SectionTitle>Waterfall · {data.children.length} child span(s)</SectionTitle>
              <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                <Waterfall
                  rootStart={data.root.start_time}
                  rootDuration={Number(data.root.duration_ms)}
                  spans={data.children}
                />
              </div>
            </section>

            {/* Tabs */}
            <section>
              <div className="mb-3 flex items-center justify-between border-b border-neutral-800">
                <div className="flex">
                  <TabButton active={tab === 'request'} onClick={() => setTab('request')}>
                    Request
                  </TabButton>
                  <TabButton active={tab === 'response'} onClick={() => setTab('response')}>
                    Response
                  </TabButton>
                </div>
              </div>

              {tab === 'request' ? (
                <div className="flex flex-col gap-4">
                  <Subsection
                    title="Headers"
                    count={Object.keys(data.root.req_headers ?? {}).length}
                  >
                    <HeadersTable headers={data.root.req_headers} />
                  </Subsection>
                  <Subsection title="Body">
                    <BodyViewer raw={data.root.req_body} />
                  </Subsection>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <Subsection
                    title="Headers"
                    count={Object.keys(data.root.res_headers ?? {}).length}
                  >
                    <HeadersTable headers={data.root.res_headers} />
                  </Subsection>
                  <Subsection title="Body">
                    <BodyViewer raw={data.root.res_body} />
                  </Subsection>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-neutral-500">
            No data found for this trace.
          </div>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-500">
      {children}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3.5 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-violet-500 text-neutral-100'
          : 'border-transparent text-neutral-500 hover:text-neutral-300'
      }`}
    >
      {children}
    </button>
  )
}

function Subsection({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-500">
        <span>{title}</span>
        {count !== undefined ? (
          <span className="rounded-sm bg-neutral-800/70 px-1 text-[9px] tabular text-neutral-400">
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function MetaRow({
  label,
  value,
  truncate,
  copyable,
}: {
  label: string
  value: string
  truncate?: boolean
  copyable?: boolean
}) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="flex items-center gap-1.5">
        <span
          className={`font-mono text-neutral-200 ${truncate ? 'truncate' : 'break-all'}`}
          title={truncate ? value : undefined}
        >
          {value}
        </span>
        {copyable ? <InlineCopy text={value} /> : null}
      </dd>
    </>
  )
}

/**
 * Headers rendered as a key-value grid. Sortable, searchable-friendly
 * (monospace with distinct columns), each row independently hoverable
 * and copyable.
 */
function HeadersTable({ headers }: { headers: Record<string, string> | null }) {
  if (!headers || Object.keys(headers).length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-xs text-neutral-600">
        No headers captured.
      </div>
    )
  }
  const entries = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/40">
      {entries.map(([k, v], i) => (
        <div
          key={k}
          className={`group grid grid-cols-[180px_1fr_auto] gap-3 px-3 py-1.5 text-xs transition-colors hover:bg-neutral-800/60 ${
            i > 0 ? 'border-t border-neutral-800' : ''
          }`}
        >
          <div className="truncate font-mono font-medium text-neutral-400" title={k}>
            {k}
          </div>
          <div className="break-all font-mono text-neutral-200">{v}</div>
          <div className="opacity-0 transition-opacity group-hover:opacity-100">
            <InlineCopy text={`${k}: ${v}`} />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Pretty-prints a captured body. If the body parses as JSON, renders it
 * with basic syntax highlighting (keys / strings / numbers / booleans /
 * null). Otherwise falls back to the raw text.
 */
function BodyViewer({ raw }: { raw: string | null | undefined }) {
  const [copied, setCopied] = useState(false)
  const { pretty, isJson } = useMemo(() => parseAndPretty(raw), [raw])

  if (raw == null || raw === '') {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-xs text-neutral-600">
        (empty)
      </div>
    )
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(pretty)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/80">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-600">
        <span>{isJson ? 'application/json' : 'text/plain'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5 font-mono text-[10px] text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-[60vh] overflow-auto p-3 font-mono text-[12px] leading-5">
        {isJson ? <JsonHighlighted text={pretty} /> : pretty}
      </pre>
    </div>
  )
}

function InlineCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="rounded border border-neutral-800 bg-neutral-900 px-1 py-[1px] text-[9px] text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
      title="Copy"
    >
      {copied ? '✓' : '⧉'}
    </button>
  )
}

function parseAndPretty(raw: string | null | undefined): { pretty: string; isJson: boolean } {
  if (!raw) return { pretty: '', isJson: false }
  try {
    const parsed = JSON.parse(raw)
    return { pretty: JSON.stringify(parsed, null, 2), isJson: true }
  } catch {
    return { pretty: raw, isJson: false }
  }
}

/**
 * Lightweight JSON syntax highlighter. Tokenises with a single regex
 * that understands string literals (including the following `:` for
 * object keys), keywords, and numbers. Punctuation falls through as
 * plain text, keeping indentation intact.
 */
function JsonHighlighted({ text }: { text: string }) {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex.exec loop
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, m.index)}</span>)
    }
    if (m[1]) {
      const isKey = typeof m[2] === 'string' && m[2].length > 0
      parts.push(
        <span key={key++} className={isKey ? 'text-sky-300' : 'text-emerald-300'}>
          {m[1]}
        </span>,
      )
      if (isKey) {
        parts.push(<span key={key++}>{m[2]}</span>)
      }
    } else if (m[3]) {
      parts.push(
        <span key={key++} className="text-violet-300">
          {m[3]}
        </span>,
      )
    } else if (m[4]) {
      parts.push(
        <span key={key++} className="text-amber-300">
          {m[4]}
        </span>,
      )
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }
  return <>{parts}</>
}

/** Best-effort pull of a user id from a Cookie header. */
function pickFromCookieUser(cookie: string): string | null {
  if (!cookie) return null
  // Try common names: userId, user_id, userid
  const m = cookie.match(/(?:^|;\s*)(userid|user_id|userId)=([^;]+)/i)
  return m?.[2] ?? null
}
