import type { ChildSpan } from '../lib/api'

interface Props {
  rootStart: string
  rootDuration: number
  spans: ChildSpan[]
}

export function Waterfall({ rootStart, rootDuration, spans }: Props) {
  if (spans.length === 0) {
    return <div className="text-xs text-neutral-500">(no child spans)</div>
  }

  const rootMs = new Date(rootStart).getTime()
  const total = Math.max(rootDuration, 1)

  return (
    <div className="flex flex-col gap-0.5">
      {spans.map((span) => {
        const spanStart = new Date(span.start_time).getTime()
        const offset = Math.max(0, spanStart - rootMs)
        const leftPct = Math.min(99, (offset / total) * 100)
        const widthPct = Math.max(
          0.5,
          Math.min(100 - leftPct, (Number(span.duration_ms) / total) * 100),
        )
        const hasError = span.status === 'ERROR' || Boolean(span.error_message)
        const dur = Number(span.duration_ms)
        const durText =
          dur < 1 ? '<1ms' : dur < 1000 ? `${dur.toFixed(0)}ms` : `${(dur / 1000).toFixed(2)}s`

        return (
          <div key={span.span_id} className="waterfall-row">
            <div className="truncate font-mono text-neutral-400" title={span.name}>
              <span className="mr-1 text-[9px] uppercase tracking-wider text-neutral-600">
                {span.kind}
              </span>
              {span.name}
            </div>
            <div className="relative h-3.5 overflow-hidden rounded-sm bg-neutral-800/80">
              <div
                className={`absolute inset-y-0 rounded-sm ${hasError ? 'bg-rose-500/70' : 'bg-violet-500/70'}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            </div>
            <div className="text-right font-mono text-neutral-500 tabular">{durText}</div>
          </div>
        )
      })}
    </div>
  )
}
