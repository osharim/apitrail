import pg, { type Pool } from 'pg'

export interface DbOptions {
  url: string
  ssl?: boolean
}

export function openPool({ url, ssl = true }: DbOptions): Pool {
  return new pg.Pool({
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
