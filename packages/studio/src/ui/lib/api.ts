export interface ServerRequest {
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

export interface ChildSpan {
  span_id: string
  parent_span_id: string | null
  name: string
  kind: string
  status: string
  start_time: string
  duration_ms: string
  error_message: string | null
}

export interface TraceDetail {
  root: ServerRequest & {
    req_headers: Record<string, string> | null
    req_body: string | null
    res_headers: Record<string, string> | null
    res_body: string | null
    error_stack: string | null
    referer: string | null
    host: string | null
    service_name: string | null
  }
  children: ChildSpan[]
}

export interface OverviewStats {
  total_24h: number
  errors_24h: number
  slow_24h: number
  p50: number
  p95: number
  rpm: number
}

export interface SpansQuery {
  limit?: number
  method?: string
  minStatus?: number
  maxStatus?: number
  pathLike?: string
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  overview: () => json<OverviewStats>('/api/overview'),
  spans: (q: SpansQuery = {}) => {
    const params = new URLSearchParams()
    if (q.limit) params.set('limit', String(q.limit))
    if (q.method) params.set('method', q.method)
    if (q.minStatus) params.set('minStatus', String(q.minStatus))
    if (q.maxStatus) params.set('maxStatus', String(q.maxStatus))
    if (q.pathLike) params.set('pathLike', q.pathLike)
    return json<ServerRequest[]>(`/api/spans?${params.toString()}`)
  },
  trace: (id: string) => json<TraceDetail>(`/api/trace/${encodeURIComponent(id)}`),
}
