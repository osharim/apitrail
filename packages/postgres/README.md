# @apitrail/postgres

> Postgres storage adapter for [apitrail](https://github.com/osharim/apitrail). Stores every captured HTTP request + child span in a single `apitrail_spans` table. Edge-safe, Supabase-ready, zero-config when paired with `@apitrail/cli install`.

[![npm](https://img.shields.io/npm/v/@apitrail/postgres/alpha?color=a78bfa&label=npm)](https://www.npmjs.com/package/@apitrail/postgres)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
pnpm add apitrail @apitrail/postgres pg
```

Or let the wizard do it:

```bash
pnpm dlx apitrail install
```

## Usage (edge-safe pattern)

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { defineConfig, register: apitrailRegister } = await import('apitrail')
  const { postgresAdapter } = await import('@apitrail/postgres')

  await apitrailRegister(
    defineConfig({
      adapter: postgresAdapter({
        connectionString: process.env.DATABASE_URL,
      }),
    }),
  )
}
```

> **Dynamic imports are required.** `pg` is Node-only. A top-level static `import { postgresAdapter } from '@apitrail/postgres'` would pull `pg` into the Edge middleware bundle and crash production with `ReferenceError: __import_unsupported is not defined`.

### Supabase (managed Postgres)

The Supabase pooler uses self-signed certs that Node's default validator rejects. Pass `rejectUnauthorized: false`:

```ts
postgresAdapter({
  connectionString: process.env.DATABASE_URL,
  poolConfig: {
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
})
```

### With a pre-built Pool

If your app already has a `pg.Pool`, pass it in — the adapter won't close it on shutdown unless you ask:

```ts
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

postgresAdapter({ pool })  // pool.end() is NOT called on apitrail shutdown
postgresAdapter({ pool, closePoolOnShutdown: true })  // pool.end() IS called
```

## Schema

Run the migration once:

```bash
pnpm dlx @apitrail/cli init
# or
pnpm dlx @apitrail/cli init --print     # prints SQL without executing
```

Or enable `autoMigrate` so the adapter runs `CREATE TABLE IF NOT EXISTS` on first insert:

```ts
postgresAdapter({
  connectionString: process.env.DATABASE_URL,
  autoMigrate: true,
})
```

Or import the SQL programmatically:

```ts
import { createSchemaSQL } from '@apitrail/postgres/schema'
await pool.query(createSchemaSQL())   // default table: apitrail_spans
await pool.query(createSchemaSQL('my_logs'))   // custom name (regex-validated)
```

### Schema shape

```sql
CREATE TABLE IF NOT EXISTS apitrail_spans (
  span_id         text PRIMARY KEY,
  trace_id        text NOT NULL,
  parent_span_id  text,

  name            text NOT NULL,
  kind            text NOT NULL,     -- SERVER | INTERNAL | CLIENT | PRODUCER | CONSUMER
  status          text NOT NULL,     -- UNSET | OK | ERROR
  start_time      timestamptz NOT NULL,
  duration_ms     double precision NOT NULL,

  method          text,
  path            text,              -- query string stripped & masked into attributes
  route           text,
  status_code     smallint,
  host            text,
  user_agent      text,
  client_ip       text,
  referer         text,

  req_headers     jsonb,
  req_body        text,              -- redacted per maskKeys
  res_headers     jsonb,
  res_body        text,              -- redacted per maskKeys

  error_message   text,
  error_stack     text,

  service_name    text,
  runtime         text NOT NULL,     -- nodejs | edge | unknown
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now()
);
```

With six indexes:

```sql
CREATE INDEX apitrail_spans_trace_id_idx     ON apitrail_spans (trace_id);
CREATE INDEX apitrail_spans_parent_idx       ON apitrail_spans (parent_span_id);
CREATE INDEX apitrail_spans_created_at_idx   ON apitrail_spans (created_at DESC);
CREATE INDEX apitrail_spans_server_idx       ON apitrail_spans (created_at DESC) WHERE kind = 'SERVER';
CREATE INDEX apitrail_spans_errors_idx       ON apitrail_spans (status_code, created_at DESC) WHERE status_code >= 400;
CREATE INDEX apitrail_spans_path_idx         ON apitrail_spans (path, created_at DESC) WHERE path IS NOT NULL;
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `pool` | `pg.Pool` | — | Pre-built pool. Takes precedence over `connectionString`. |
| `connectionString` | `string` | — | Used only if `pool` not provided. |
| `poolConfig` | `pg.PoolConfig` | — | Extra config (ssl, max, etc.). |
| `tableName` | `string` | `apitrail_spans` | Must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/` — any other char is rejected at construction time to prevent SQL injection via config. |
| `autoMigrate` | `boolean` | `false` | Runs `CREATE TABLE IF NOT EXISTS` on first insert. Opt in for dev; prefer `apitrail init` in prod. |
| `onError` | `(err) => void` | `console.error` | Insert-failure callback. Route to Sentry / alerting. |
| `closePoolOnShutdown` | `boolean` | `true` if the adapter created the pool, else `false` | Whether to call `pool.end()` on shutdown. |

## Implementation notes

- **`pg` is lazy-loaded.** `postgresAdapter(...)` does not import `pg` at call time — it's dynamically imported on the first `insertBatch`. This is what makes the adapter safe to static-import from a Next.js `instrumentation.ts` (though we still recommend the dynamic-import pattern for future-proofing).
- **Batched inserts.** All rows in one batch go into one parameterised `INSERT … VALUES (…), (…), (…)` with `ON CONFLICT (span_id) DO NOTHING`. The per-batch round-trip is the only DB cost.
- **Identifier safety.** Table name is whitelisted via regex at construction; anything else throws. Column names are hardcoded constants, never from user input. Values always go through pg parameter binding.

## License

MIT — [full repo](https://github.com/osharim/apitrail)
