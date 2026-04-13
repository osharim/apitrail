export interface LogEntry {
  traceId: string
  spanId: string
  timestamp: number
  method: string
  path: string
  route?: string
  statusCode?: number
  durationMs: number
  userAgent?: string
  clientIp?: string
  referer?: string
  host?: string
  runtime: 'nodejs' | 'edge' | 'unknown'
  error?: {
    message: string
    stack?: string
  }
  attributes: Record<string, string | number | boolean>
}

export interface StorageAdapter {
  name: string
  insertBatch: (entries: LogEntry[]) => Promise<void> | void
  shutdown?: () => Promise<void> | void
}

export interface ResolvedConfig {
  serviceName: string
  adapter: StorageAdapter
  skipPaths: (string | RegExp)[]
  methods: string[] | null
  statusCodes: number[] | null
  slowMs: number
  sampleRate: number
  batch: {
    maxSize: number
    intervalMs: number
  }
  debug: boolean
}

export type ApitrailConfig = Partial<Omit<ResolvedConfig, 'adapter'>> & {
  adapter?: StorageAdapter
}
