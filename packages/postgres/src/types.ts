import type pg from 'pg'

export interface PostgresAdapterOptions {
  /** Pre-built `pg.Pool`. Takes precedence over `connectionString`. */
  pool?: pg.Pool
  /** Postgres connection string. Used only if `pool` is not provided. */
  connectionString?: string
  /** Additional `pg.PoolConfig` options merged on top of `connectionString`. */
  poolConfig?: Omit<pg.PoolConfig, 'connectionString'>
  /** Table name. Defaults to `apitrail_spans`. Must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`. */
  tableName?: string
  /**
   * If true, run `CREATE TABLE IF NOT EXISTS …` on startup.
   * Default: `false` (opt-in — prefer running the CLI explicitly in production).
   */
  autoMigrate?: boolean
  /**
   * Callback invoked when an insert batch fails. Defaults to `console.error`.
   * Use this to route errors to Sentry / alerting.
   */
  onError?: (err: unknown) => void
  /**
   * If true, close the pool when the adapter shuts down.
   * Default: true when the adapter created the pool, false when a pool was injected.
   */
  closePoolOnShutdown?: boolean
}
