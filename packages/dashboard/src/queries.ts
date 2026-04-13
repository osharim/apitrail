import 'server-only'
import { resolvePool, resolveTableName } from './lib/db.js'
import type { ChildSpan, DashboardProps, DetailRow, OverviewStats, ServerRequest } from './types.js'

export async function getOverviewStats(props: DashboardProps): Promise<OverviewStats> {
  const pool = resolvePool(props)
  const t = resolveTableName(props)

  const { rows } = await pool.query<{
    total_24h: string
    errors_24h: string
    slow_24h: string
    p50: number | null
    p95: number | null
  }>(`
    SELECT
      count(*) FILTER (WHERE kind = 'SERVER')::text AS total_24h,
      count(*) FILTER (WHERE kind = 'SERVER' AND status_code >= 400)::text AS errors_24h,
      count(*) FILTER (WHERE kind = 'SERVER' AND duration_ms > 500)::text AS slow_24h,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE kind = 'SERVER') AS p50,
      percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE kind = 'SERVER') AS p95
    FROM ${t}
    WHERE created_at > now() - interval '24 hours'
  `)

  const row = rows[0]
  const total = Number(row?.total_24h ?? 0)
  return {
    total_24h: total,
    errors_24h: Number(row?.errors_24h ?? 0),
    slow_24h: Number(row?.slow_24h ?? 0),
    p50: Number(row?.p50 ?? 0),
    p95: Number(row?.p95 ?? 0),
    rpm: total / (24 * 60),
  }
}

export async function getRecentRequests(
  props: DashboardProps,
  limit = 50,
): Promise<ServerRequest[]> {
  const pool = resolvePool(props)
  const t = resolveTableName(props)

  const { rows } = await pool.query<ServerRequest>(
    `SELECT span_id, trace_id, method, path, route, status_code, duration_ms,
            start_time, created_at, error_message, user_agent, client_ip, runtime
     FROM ${t}
     WHERE kind = 'SERVER'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  )
  return rows
}

export async function getRequestDetail(
  props: DashboardProps,
  traceId: string,
): Promise<{ root: DetailRow | null; children: ChildSpan[] }> {
  const pool = resolvePool(props)
  const t = resolveTableName(props)

  const [rootRes, childrenRes] = await Promise.all([
    pool.query<DetailRow>(
      `SELECT *
       FROM ${t}
       WHERE trace_id = $1 AND kind = 'SERVER'
       LIMIT 1`,
      [traceId],
    ),
    pool.query<ChildSpan>(
      `SELECT span_id, parent_span_id, name, kind, status, start_time, duration_ms, error_message
       FROM ${t}
       WHERE trace_id = $1 AND kind != 'SERVER'
       ORDER BY start_time ASC`,
      [traceId],
    ),
  ])

  return { root: rootRes.rows[0] ?? null, children: childrenRes.rows }
}
