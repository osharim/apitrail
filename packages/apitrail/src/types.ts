export type SpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER'
export type SpanStatus = 'UNSET' | 'OK' | 'ERROR'

export interface SpanEntry {
  // Identity
  traceId: string
  spanId: string
  parentSpanId?: string

  // Span basics
  name: string
  kind: SpanKind
  status: SpanStatus
  startTime: number // ms since epoch
  durationMs: number

  // HTTP (present on SERVER and CLIENT HTTP spans)
  method?: string
  path?: string
  route?: string
  statusCode?: number
  host?: string
  userAgent?: string
  clientIp?: string
  referer?: string

  // Bodies (only captured on HTTP SERVER root spans when captureBodies=true)
  reqHeaders?: Record<string, string>
  reqBody?: string
  resHeaders?: Record<string, string>
  resBody?: string

  // Error
  error?: {
    message: string
    stack?: string
  }

  // Context
  serviceName?: string
  runtime: 'nodejs' | 'edge' | 'unknown'

  // All other OTEL attributes
  attributes: Record<string, string | number | boolean>
}

export interface StorageAdapter {
  name: string
  insertBatch: (entries: SpanEntry[]) => Promise<void> | void
  shutdown?: () => Promise<void> | void
}

export interface SamplingConfig {
  /** Rate (0-1) for successful requests (2xx/3xx). Default: 1 (all). */
  success?: number
  /** Rate (0-1) for errors (4xx/5xx). Default: 1 (all). */
  error?: number
  /** Rate (0-1) for slow requests (duration > slowMs). Default: 1 (all). */
  slow?: number
}

export interface ResolvedConfig {
  serviceName: string
  adapter: StorageAdapter
  skipPaths: readonly (string | RegExp)[]
  methods: readonly string[] | null
  statusCodes: readonly number[] | null
  slowMs: number
  sampling: Required<SamplingConfig>

  /** Capture request/response headers on HTTP SERVER spans. Default: true. */
  captureHeaders: boolean
  /** Capture request/response bodies on HTTP SERVER spans. Default: true. */
  captureBodies: boolean
  /** Capture child spans (fetches, DB queries, renders, etc.). Default: true. */
  captureChildren: boolean
  /** Maximum captured body size in chars. Default: 10_000. -1 for unlimited. */
  maxBodySize: number

  /** Keys (headers/JSON fields) to redact. */
  maskKeys: readonly string[]

  batch: {
    maxSize: number
    intervalMs: number
  }
  debug: boolean
}

export type ApitrailConfig = Partial<
  Omit<ResolvedConfig, 'adapter' | 'sampling' | 'maskKeys' | 'batch'>
> & {
  adapter?: StorageAdapter
  sampling?: SamplingConfig
  maskKeys?: readonly string[]
  batch?: Partial<ResolvedConfig['batch']>
}
