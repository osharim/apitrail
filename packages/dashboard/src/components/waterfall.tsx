import type { ReactElement } from 'react'
import type { ChildSpan } from '../types.js'

interface Props {
  rootStart: Date
  rootDuration: number
  spans: ChildSpan[]
}

/**
 * Renders a minimal Chrome-DevTools-style waterfall for child spans. Each bar
 * is positioned proportionally to its offset/duration within the root span.
 */
export function Waterfall({ rootStart, rootDuration, spans }: Props): ReactElement {
  if (spans.length === 0) {
    return <div className="at-dim">(no child spans)</div>
  }

  const rootMs = rootStart.getTime()
  const total = Math.max(rootDuration, 1)

  return (
    <div className="at-waterfall">
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
          <div key={span.span_id} className="at-wf-row">
            <div className="at-wf-name" title={span.name}>
              {span.name}
            </div>
            <div className="at-wf-bar-wrap">
              <div
                className={`at-wf-bar ${hasError ? 'error' : ''}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            </div>
            <div className="at-wf-duration">{durText}</div>
          </div>
        )
      })}
    </div>
  )
}
