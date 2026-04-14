import { usePoll } from '../hooks/usePoll'
import { api } from '../lib/api'
import { fmtDuration, fmtNumber } from '../lib/format'
import { KpiCard } from './KpiCard'

export function Overview() {
  const { data, error } = usePoll(() => api.overview(), 10_000)

  if (error) {
    return (
      <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4 text-sm text-rose-300">
        Failed to load overview: {error.message}
      </div>
    )
  }

  const errorRate =
    data && data.total_24h > 0 ? ((data.errors_24h / data.total_24h) * 100).toFixed(1) : '0.0'

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard
        label="Requests · 24h"
        value={data ? fmtNumber(data.total_24h) : '—'}
        sub={data ? `${data.rpm.toFixed(1)} rpm avg` : ''}
      />
      <KpiCard
        label="Errors · 24h"
        value={data ? fmtNumber(data.errors_24h) : '—'}
        sub={data ? `${errorRate}% rate` : ''}
        tone={data && data.errors_24h > 0 ? 'error' : 'default'}
      />
      <KpiCard
        label="Slow · 24h"
        value={data ? fmtNumber(data.slow_24h) : '—'}
        sub=">500ms"
        tone={data && data.slow_24h > 0 ? 'warn' : 'default'}
      />
      <KpiCard label="p50" value={data ? fmtDuration(data.p50) : '—'} />
      <KpiCard label="p95" value={data ? fmtDuration(data.p95) : '—'} />
    </div>
  )
}
