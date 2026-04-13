/**
 * SQL to create the apitrail table and its indexes.
 * Safe to run multiple times (uses `IF NOT EXISTS`).
 */
export function createSchemaSQL(tableName = 'apitrail_logs'): string {
  const t = quoteIdent(tableName)
  return `
CREATE TABLE IF NOT EXISTS ${t} (
  id            bigserial PRIMARY KEY,
  trace_id      text NOT NULL,
  span_id       text NOT NULL,
  timestamp     timestamptz NOT NULL,
  method        text NOT NULL,
  path          text NOT NULL,
  route         text,
  status_code   smallint,
  duration_ms   double precision NOT NULL,
  user_agent    text,
  client_ip     text,
  referer       text,
  host          text,
  runtime       text NOT NULL,
  error_message text,
  error_stack   text,
  attributes    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_created_at_idx`)}
  ON ${t} (created_at DESC);

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_trace_id_idx`)}
  ON ${t} (trace_id);

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_errors_idx`)}
  ON ${t} (status_code, created_at DESC)
  WHERE status_code >= 400;

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_path_idx`)}
  ON ${t} (path, created_at DESC);
`.trim()
}

export function dropSchemaSQL(tableName = 'apitrail_logs'): string {
  return `DROP TABLE IF EXISTS ${quoteIdent(tableName)} CASCADE;`
}

/**
 * Quotes a Postgres identifier safely.
 * Throws if the identifier contains characters outside a conservative whitelist,
 * which protects against injection via table-name config.
 */
export function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid Postgres identifier: ${JSON.stringify(name)}. ` +
        'Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/',
    )
  }
  return `"${name}"`
}
