import type { LogEntry, StorageAdapter } from 'apitrail'
import { Pool } from 'pg'
import { createSchemaSQL, quoteIdent } from './schema.js'
import type { PostgresAdapterOptions } from './types.js'

const COLUMNS = [
  'trace_id',
  'span_id',
  'timestamp',
  'method',
  'path',
  'route',
  'status_code',
  'duration_ms',
  'user_agent',
  'client_ip',
  'referer',
  'host',
  'runtime',
  'error_message',
  'error_stack',
  'attributes',
] as const

type EntryRow = [
  string, // trace_id
  string, // span_id
  Date, // timestamp
  string, // method
  string, // path
  string | null, // route
  number | null, // status_code
  number, // duration_ms
  string | null, // user_agent
  string | null, // client_ip
  string | null, // referer
  string | null, // host
  string, // runtime
  string | null, // error_message
  string | null, // error_stack
  string, // attributes (JSON)
]

function toRow(e: LogEntry): EntryRow {
  return [
    e.traceId,
    e.spanId,
    new Date(e.timestamp),
    e.method,
    e.path,
    e.route ?? null,
    e.statusCode ?? null,
    e.durationMs,
    e.userAgent ?? null,
    e.clientIp ?? null,
    e.referer ?? null,
    e.host ?? null,
    e.runtime,
    e.error?.message ?? null,
    e.error?.stack ?? null,
    JSON.stringify(e.attributes ?? {}),
  ]
}

/**
 * Builds a parameterized bulk-insert statement like:
 *   INSERT INTO "apitrail_logs" (col1, col2, …) VALUES ($1, $2, …), ($n, $n+1, …)
 */
function buildInsertSQL(tableName: string, batchSize: number): string {
  const t = quoteIdent(tableName)
  const cols = COLUMNS.join(', ')
  const tuples: string[] = []
  for (let i = 0; i < batchSize; i++) {
    const base = i * COLUMNS.length
    const placeholders = COLUMNS.map((_, j) => `$${base + j + 1}`).join(', ')
    tuples.push(`(${placeholders})`)
  }
  return `INSERT INTO ${t} (${cols}) VALUES ${tuples.join(', ')}`
}

export function postgresAdapter(options: PostgresAdapterOptions = {}): StorageAdapter {
  const tableName = options.tableName ?? 'apitrail_logs'
  // Validate upfront so misconfiguration fails fast.
  quoteIdent(tableName)

  const ownsPool = !options.pool
  const pool: Pool = options.pool ??
    new Pool({
      connectionString: options.connectionString,
      ...options.poolConfig,
    })

  const closePoolOnShutdown = options.closePoolOnShutdown ?? ownsPool
  const onError = options.onError ?? ((err: unknown) => {
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

    async insertBatch(entries: LogEntry[]): Promise<void> {
      if (entries.length === 0) return
      try {
        await ensureMigrated()
        const sql = buildInsertSQL(tableName, entries.length)
        const params: unknown[] = []
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
