import 'server-only'
import pg from 'pg'
import type { DashboardProps } from '../types.js'

const { Pool } = pg

// Cache pools per connection string. Next.js RSCs run per-request, so we want
// ONE pool per unique config for the lifetime of the server process.
const pools = new Map<string, pg.Pool>()

export function resolvePool(props: DashboardProps): pg.Pool {
  if (props.pool) return props.pool

  const connectionString =
    props.connectionString ??
    process.env.APITRAIL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL

  if (!connectionString) {
    throw new Error(
      '@apitrail/dashboard: no database configured. ' +
        'Pass `connectionString` or set APITRAIL_DATABASE_URL / DATABASE_URL.',
    )
  }

  const key = `${connectionString}::${JSON.stringify(props.poolConfig ?? {})}`
  const cached = pools.get(key)
  if (cached) return cached

  const pool = new Pool({
    connectionString,
    ...props.poolConfig,
  })
  pools.set(key, pool)
  return pool
}

export function resolveTableName(props: DashboardProps): string {
  const name = props.tableName ?? 'apitrail_spans'
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table name: ${JSON.stringify(name)}`)
  }
  return `"${name}"`
}
