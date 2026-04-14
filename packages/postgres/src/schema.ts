/**
 * SQL to create the apitrail spans table and its indexes.
 * Safe to run multiple times (uses `IF NOT EXISTS`).
 *
 * Each row is one OpenTelemetry span — including the root HTTP request span
 * and all of its children (fetches, DB queries, renders, etc.). Bodies and
 * headers are only populated on SERVER spans (the root request).
 */
export function createSchemaSQL(tableName = 'apitrail_spans'): string {
  const t = quoteIdent(tableName)
  return `
CREATE TABLE IF NOT EXISTS ${t} (
  span_id         text PRIMARY KEY,
  trace_id        text NOT NULL,
  parent_span_id  text,

  name            text NOT NULL,
  kind            text NOT NULL,
  status          text NOT NULL,
  start_time      timestamptz NOT NULL,
  duration_ms     double precision NOT NULL,

  method          text,
  path            text,
  route           text,
  status_code     smallint,
  host            text,
  user_agent      text,
  client_ip       text,
  referer         text,

  req_headers     jsonb,
  req_body        text,
  res_headers     jsonb,
  res_body        text,

  error_message   text,
  error_stack     text,

  service_name    text,
  runtime         text NOT NULL,
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_trace_id_idx`)}
  ON ${t} (trace_id);

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_parent_idx`)}
  ON ${t} (parent_span_id);

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_created_at_idx`)}
  ON ${t} (created_at DESC);

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_server_idx`)}
  ON ${t} (created_at DESC)
  WHERE kind = 'SERVER';

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_errors_idx`)}
  ON ${t} (status_code, created_at DESC)
  WHERE status_code >= 400;

CREATE INDEX IF NOT EXISTS ${quoteIdent(`${tableName}_path_idx`)}
  ON ${t} (path, created_at DESC)
  WHERE path IS NOT NULL;
`.trim()
}

export function dropSchemaSQL(tableName = 'apitrail_spans'): string {
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
      `Invalid Postgres identifier: ${JSON.stringify(name)}. Must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`,
    )
  }
  return `"${name}"`
}
