# @apitrail/postgres

> Postgres storage adapter for [apitrail](https://apitrail.io).

## Install

```bash
npm install @apitrail/postgres pg
```

## Usage

```ts
// instrumentation.ts
import { register, defineConfig } from 'apitrail'
import { postgresAdapter } from '@apitrail/postgres'

const config = defineConfig({
  adapter: postgresAdapter({
    connectionString: process.env.DATABASE_URL,
    autoMigrate: true, // creates the table on first run
  }),
})

export function register() {
  return apitrailRegister(config)
}
```

### With a pre-built Pool

If you already have a `pg.Pool` (e.g. reused across your app), pass it in:

```ts
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

postgresAdapter({ pool })
```

When you inject a pool, the adapter will **not** close it on shutdown unless you pass `closePoolOnShutdown: true`.

### Supabase / SSL

```ts
postgresAdapter({
  connectionString: process.env.DATABASE_URL,
  poolConfig: { ssl: { rejectUnauthorized: false } },
  autoMigrate: true,
})
```

## Schema

Run once (or set `autoMigrate: true`):

```sql
CREATE TABLE IF NOT EXISTS apitrail_logs (
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

CREATE INDEX apitrail_logs_created_at_idx ON apitrail_logs (created_at DESC);
CREATE INDEX apitrail_logs_trace_id_idx   ON apitrail_logs (trace_id);
CREATE INDEX apitrail_logs_errors_idx     ON apitrail_logs (status_code, created_at DESC) WHERE status_code >= 400;
CREATE INDEX apitrail_logs_path_idx       ON apitrail_logs (path, created_at DESC);
```

Or import the SQL programmatically:

```ts
import { createSchemaSQL } from '@apitrail/postgres/schema'
await pool.query(createSchemaSQL())
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `pool` | `pg.Pool` | — | Pre-built pool. Takes precedence over `connectionString`. |
| `connectionString` | `string` | — | Used only if `pool` not provided. |
| `poolConfig` | `pg.PoolConfig` | — | Extra Pool config (ssl, max, etc.). |
| `tableName` | `string` | `apitrail_logs` | Must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`. |
| `autoMigrate` | `boolean` | `false` | Runs `CREATE TABLE IF NOT EXISTS` on first insert. |
| `onError` | `(err) => void` | `console.error` | Error handler (insert failures, etc.). |
| `closePoolOnShutdown` | `boolean` | `true` if adapter created the pool | Close the pool when apitrail shuts down. |

## License

MIT
