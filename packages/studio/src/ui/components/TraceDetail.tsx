import { useEffect, useState } from 'react'
import { type TraceDetail as TraceDetailData, api } from '../lib/api'
import { fmtDuration, prettyJson } from '../lib/format'
import { MethodBadge, StatusBadge } from './Badge'
import { Waterfall } from './Waterfall'

interface Props {
  traceId: string | null
  onClose: () => void
}

export function TraceDetail({ traceId, onClose }: Props) {
  const [data, setData] = useState<TraceDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!traceId) {
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
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

  if (!traceId) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.1em] text-neutral-500">
            Request
          </div>
          <div className="font-mono text-xs text-neutral-500">{traceId.slice(0, 8)}…</div>
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
                <MetaRow label="trace_id" value={data.root.trace_id} />
                <MetaRow label="span_id" value={data.root.span_id} />
                <MetaRow label="route" value={data.root.route ?? '—'} />
                <MetaRow label="runtime" value={data.root.runtime} />
                <MetaRow label="host" value={data.root.host ?? '—'} />
                <MetaRow label="client_ip" value={data.root.client_ip ?? '—'} />
                <MetaRow label="user_agent" value={data.root.user_agent ?? '—'} truncate />
                <MetaRow label="referer" value={data.root.referer ?? '—'} />
                <MetaRow label="started" value={new Date(data.root.start_time).toISOString()} />
              </dl>
            </section>

            <section>
              <Header>Waterfall · {data.children.length} child span(s)</Header>
              <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                <Waterfall
                  rootStart={data.root.start_time}
                  rootDuration={Number(data.root.duration_ms)}
                  spans={data.children}
                />
              </div>
            </section>

            <section>
              <Header>Request</Header>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <BodyBox
                  label="Headers"
                  body={prettyJson(JSON.stringify(data.root.req_headers ?? {}))}
                />
                <BodyBox label="Body" body={prettyJson(data.root.req_body)} />
              </div>
            </section>

            <section>
              <Header>Response</Header>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <BodyBox
                  label="Headers"
                  body={prettyJson(JSON.stringify(data.root.res_headers ?? {}))}
                />
                <BodyBox label="Body" body={prettyJson(data.root.res_body)} />
              </div>
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

function MetaRow({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd
        className={`font-mono text-neutral-200 ${truncate ? 'truncate' : 'break-all'}`}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </>
  )
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-500">
      {children}
    </div>
  )
}

function BodyBox({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-600">{label}</div>
      <pre className="code max-h-80 overflow-auto">
        {body || <span className="text-neutral-600">(empty)</span>}
      </pre>
    </div>
  )
}
