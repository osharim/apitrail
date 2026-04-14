import type pg from 'pg'

export interface DashboardProps {
  /** Resolved search params from the Next.js page. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>
  /** Resolved path segments from `[[...path]]` route. Empty = overview. */
  params?: Promise<{ path?: string[] }>
  /** Reusable pool. Takes precedence over `connectionString`. */
  pool?: pg.Pool
  /** Postgres connection string. Falls back to env vars if omitted. */
  connectionString?: string
  /** Extra `pg.PoolConfig` options. */
  poolConfig?: Omit<pg.PoolConfig, 'connectionString'>
  /** Table name. Default: `apitrail_spans`. */
  tableName?: string
  /** Base path where the dashboard is mounted. Default: `/apitrail`. */
  basePath?: string
  /**
   * Optional auth guard. Return `false` to hide the dashboard.
   * Runs on the server; throw a redirect if you want auth enforcement.
   */
  auth?: () => Promise<boolean> | boolean
}

export interface ServerRequest {
  span_id: string
  trace_id: string
  method: string
  path: string
  route: string | null
  status_code: number | null
  duration_ms: number
  start_time: Date
  created_at: Date
  error_message: string | null
  user_agent: string | null
  client_ip: string | null
  runtime: string
}

export interface DetailRow extends ServerRequest {
  req_headers: Record<string, string> | null
  req_body: string | null
  res_headers: Record<string, string> | null
  res_body: string | null
  error_stack: string | null
  referer: string | null
  host: string | null
  service_name: string | null
}

export interface ChildSpan {
  span_id: string
  parent_span_id: string | null
  name: string
  kind: string
  status: string
  start_time: Date
  duration_ms: number
  error_message: string | null
}

export interface OverviewStats {
  total_24h: number
  errors_24h: number
  slow_24h: number
  p50: number
  p95: number
  rpm: number
}
