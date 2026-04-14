import pg from 'pg'

const { Pool } = pg

export interface DbOptions {
  url: string
  ssl?: boolean
}

export function openPool({ url, ssl = true }: DbOptions): pg.Pool {
  return new Pool({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
  })
}

export function resolveUrl(flag: string | undefined): string | undefined {
  return (
    flag ??
    process.env.APITRAIL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL
  )
}
