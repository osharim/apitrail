import type { ReactElement } from 'react'
import { KpiCard } from './components/kpi-card.js'
import { DurationCell, MethodBadge, StatusBadge } from './components/status-badge.js'
import { fmtDuration, fmtNumber, fmtTime } from './lib/format.js'
import { getOverviewStats, getRecentRequests } from './queries.js'
import type { DashboardProps } from './types.js'

export async function Overview(props: DashboardProps): Promise<ReactElement> {
  const basePath = props.basePath ?? '/apitrail'
  const [stats, requests] = await Promise.all([
    getOverviewStats(props),
    getRecentRequests(props, 50),
  ])

  return (
    <>
      <div className="at-grid">
        <KpiCard
          label="Requests · 24h"
          value={fmtNumber(stats.total_24h)}
          sub={`${stats.rpm.toFixed(1)} rpm avg`}
        />
        <KpiCard
          label="Errors · 24h"
          value={fmtNumber(stats.errors_24h)}
          tone={stats.errors_24h > 0 ? 'error' : undefined}
          sub={
            stats.total_24h > 0
              ? `${((stats.errors_24h / stats.total_24h) * 100).toFixed(1)}% rate`
              : '—'
          }
        />
        <KpiCard
          label="Slow · 24h"
          value={fmtNumber(stats.slow_24h)}
          tone={stats.slow_24h > 0 ? 'warn' : undefined}
          sub=">500ms"
        />
        <KpiCard label="p50" value={fmtDuration(stats.p50)} />
        <KpiCard label="p95" value={fmtDuration(stats.p95)} />
      </div>

      <h2 className="at-section-title">Recent requests</h2>
      {requests.length === 0 ? (
        <div className="at-card at-empty">
          No requests captured yet. Hit some endpoints to see them here.
        </div>
      ) : (
        <div className="at-table-wrap">
          <table className="at-table">
            <thead>
              <tr>
                <th style={{ width: 72 }}>Time</th>
                <th style={{ width: 74 }}>Method</th>
                <th>Path</th>
                <th style={{ width: 72 }}>Status</th>
                <th style={{ width: 80, textAlign: 'right' }}>Duration</th>
                <th style={{ width: 110 }}>Trace</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.span_id}>
                  <td className="at-dim at-mono">{fmtTime(r.created_at)}</td>
                  <td>
                    <MethodBadge method={r.method} />
                  </td>
                  <td>
                    <a href={`${basePath}/${r.trace_id}`} className="row-link at-mono">
                      {r.path}
                    </a>
                    {r.error_message ? (
                      <div className="at-dim" style={{ fontSize: 11, marginTop: 2 }}>
                        ⚠ {r.error_message}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <StatusBadge code={r.status_code} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <DurationCell ms={Number(r.duration_ms)} />
                  </td>
                  <td className="at-dim at-mono">{r.trace_id.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
