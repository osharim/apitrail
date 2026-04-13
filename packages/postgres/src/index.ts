import type { SpanEntry, StorageAdapter } from 'apitrail'
import pg from 'pg'
import { createSchemaSQL, quoteIdent } from './schema.js'
import type { PostgresAdapterOptions } from './types.js'

const { Pool } = pg

const COLUMNS = [
  'span_id',
  'trace_id',
  'parent_span_id',
  'name',
  'kind',
  'status',
  'start_time',
  'duration_ms',
  'method',
  'path',
  'route',
  'status_code',
  'host',
  'user_agent',
  'client_ip',
  'referer',
  'req_headers',
  'req_body',
  'res_headers',
  'res_body',
  'error_message',
  'error_stack',
  'service_name',
  'runtime',
  'attributes',
] as const

type Value = string | number | boolean | Date | null

function toRow(e: SpanEntry): Value[] {
  return [
    e.spanId,
    e.traceId,
    e.parentSpanId ?? null,
    e.name,
    e.kind,
    e.status,
    new Date(e.startTime),
    e.durationMs,
    e.method ?? null,
    e.path ?? null,
    e.route ?? null,
    e.statusCode ?? null,
    e.host ?? null,
    e.userAgent ?? null,
    e.clientIp ?? null,
    e.referer ?? null,
    e.reqHeaders ? JSON.stringify(e.reqHeaders) : null,
    e.reqBody ?? null,
    e.resHeaders ? JSON.stringify(e.resHeaders) : null,
    e.resBody ?? null,
    e.error?.message ?? null,
    e.error?.stack ?? null,
    e.serviceName ?? null,
    e.runtime,
    JSON.stringify(e.attributes ?? {}),
  ]
}

function buildInsertSQL(tableName: string, batchSize: number): string {
  const t = quoteIdent(tableName)
  const cols = COLUMNS.join(', ')
  const tuples: string[] = []
  for (let i = 0; i < batchSize; i++) {
    const base = i * COLUMNS.length
    const placeholders = COLUMNS.map((_, j) => `$${base + j + 1}`).join(', ')
    tuples.push(`(${placeholders})`)
  }
  return `INSERT INTO ${t} (${cols}) VALUES ${tuples.join(', ')} ON CONFLICT (span_id) DO NOTHING`
}

export function postgresAdapter(options: PostgresAdapterOptions = {}): StorageAdapter {
  const tableName = options.tableName ?? 'apitrail_spans'
  // Validate upfront so misconfiguration fails fast.
  quoteIdent(tableName)

  const ownsPool = !options.pool
  const pool: pg.Pool =
    options.pool ??
    new Pool({
      connectionString: options.connectionString,
      ...options.poolConfig,
    })

  const closePoolOnShutdown = options.closePoolOnShutdown ?? ownsPool
  const onError =
    options.onError ??
    ((err: unknown) => {
      console.error('[apitrail/postgres]', err)
    })

  let migrated = !options.autoMigrate
  let migrationPromise: Promise<void> | null = null

  async function ensureMigrated(): Promise<void> {
    if (migrated) return
    if (!migrationPromise) {
      migrationPromise = pool
        .query(createSchemaSQL(tableName))
        .then(() => {
          migrated = true
        })
        .catch((err) => {
          migrationPromise = null
          throw err
        })
    }
    await migrationPromise
  }

  return {
    name: 'postgres',

    async insertBatch(entries: SpanEntry[]): Promise<void> {
      if (entries.length === 0) return
      try {
        await ensureMigrated()
        const sql = buildInsertSQL(tableName, entries.length)
        const params: Value[] = []
        for (const e of entries) {
          params.push(...toRow(e))
        }
        await pool.query(sql, params)
      } catch (err) {
        onError(err)
      }
    },

    async shutdown(): Promise<void> {
      if (closePoolOnShutdown) {
        try {
          await pool.end()
        } catch (err) {
          onError(err)
        }
      }
    },
  }
}

export { createSchemaSQL, dropSchemaSQL } from './schema.js'
export type { PostgresAdapterOptions } from './types.js'
