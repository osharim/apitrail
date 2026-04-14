import type pg from 'pg'

export interface ServerRow {
  span_id: string
  trace_id: string
  method: string
  path: string
  route: string | null
  status_code: number | null
  duration_ms: string
  start_time: string
  created_at: string
  error_message: string | null
  user_agent: string | null
  client_ip: string | null
  runtime: string
}

export interface DetailRow extends ServerRow {
  req_headers: Record<string, string> | null
  req_body: string | null
  res_headers: Record<string, string> | null
  res_body: string | null
  error_stack: string | null
  referer: string | null
  host: string | null
  service_name: string | null
}

export interface ChildRow {
  span_id: string
  parent_span_id: string | null
  name: string
  kind: string
  status: string
  start_time: string
  duration_ms: string
  error_message: string | null
}

export interface OverviewRow {
  total_24h: string
  errors_24h: string
  slow_24h: string
  p50: number | null
  p95: number | null
}

export interface SpansFilter {
  limit?: number
  method?: string
  minStatus?: number
  maxStatus?: number
  pathLike?: string
}

function qi(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${JSON.stringify(name)}`)
  }
  return `"${name}"`
}

export async function getOverview(pool: pg.Pool, table: string): Promise<OverviewRow> {
  const t = qi(table)
  const { rows } = await pool.query<OverviewRow>(`
    SELECT
      count(*) FILTER (WHERE kind = 'SERVER')::text AS total_24h,
      count(*) FILTER (WHERE kind = 'SERVER' AND status_code >= 400)::text AS errors_24h,
      count(*) FILTER (WHERE kind = 'SERVER' AND duration_ms > 500)::text AS slow_24h,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE kind = 'SERVER') AS p50,
      percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE kind = 'SERVER') AS p95
    FROM ${t}
    WHERE created_at > now() - interval '24 hours'
  `)
  return rows[0] ?? { total_24h: '0', errors_24h: '0', slow_24h: '0', p50: null, p95: null }
}

export async function getSpans(
  pool: pg.Pool,
  table: string,
  filter: SpansFilter,
): Promise<ServerRow[]> {
  const t = qi(table)
  const conds: string[] = [`kind = 'SERVER'`]
  const params: (string | number)[] = []

  if (filter.method) {
    params.push(filter.method.toUpperCase())
    conds.push(`method = $${params.length}`)
  }
  if (filter.minStatus !== undefined) {
    params.push(filter.minStatus)
    conds.push(`status_code >= $${params.length}`)
  }
  if (filter.maxStatus !== undefined) {
    params.push(filter.maxStatus)
    conds.push(`status_code <= $${params.length}`)
  }
  if (filter.pathLike) {
    params.push(`%${filter.pathLike}%`)
    conds.push(`path ILIKE $${params.length}`)
  }

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500)
  params.push(limit)

  const { rows } = await pool.query<ServerRow>(
    `SELECT span_id, trace_id, method, path, route, status_code, duration_ms,
            start_time, created_at, error_message, user_agent, client_ip, runtime
     FROM ${t}
     WHERE ${conds.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  )
  return rows
}

export async function getTrace(
  pool: pg.Pool,
  table: string,
  traceId: string,
): Promise<{ root: DetailRow | null; children: ChildRow[] }> {
  const t = qi(table)
  const [rootRes, childRes] = await Promise.all([
    pool.query<DetailRow>(
      `SELECT *
       FROM ${t}
       WHERE trace_id = $1 AND kind = 'SERVER'
       LIMIT 1`,
      [traceId],
    ),
    pool.query<ChildRow>(
      `SELECT span_id, parent_span_id, name, kind, status, start_time, duration_ms, error_message
       FROM ${t}
       WHERE trace_id = $1 AND kind != 'SERVER'
       ORDER BY start_time ASC`,
      [traceId],
    ),
  ])
  return { root: rootRes.rows[0] ?? null, children: childRes.rows }
}
