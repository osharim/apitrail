# Integrating apitrail

A copy-paste-ready guide for integrating apitrail into an existing Next.js project. **Optimized for AI coding agents.** Do not invent config keys — this file is the source of truth for the public API shape.

## TL;DR (90 seconds)

```bash
pnpm add apitrail @apitrail/postgres
pnpm dlx @apitrail/cli init            # creates the apitrail_spans table
```

```ts
// instrumentation.ts  (next to package.json)
import { defineConfig, register as apitrailRegister } from 'apitrail'
import { postgresAdapter } from '@apitrail/postgres'

const config = defineConfig({
  serviceName: 'my-app',
  adapter: postgresAdapter({
    connectionString: process.env.DATABASE_URL,
  }),
})

export const register = () => apitrailRegister(config)
```

Done. Every request to the Next.js app is now captured.

## Requirements

- Next.js **>= 15.0.0** (App Router)
- Node.js **>= 20**
- A Postgres-compatible database (Supabase, Neon, RDS, self-hosted, or local Docker)

## Install

### Minimum (console logging, dev only)
```bash
pnpm add apitrail
```

### Recommended (Postgres persistence)
```bash
pnpm add apitrail @apitrail/postgres pg
pnpm add -D @types/pg
```

### With the dashboard UI
```bash
pnpm add apitrail @apitrail/postgres @apitrail/dashboard pg server-only
pnpm add -D @types/pg
```

## Create the table

Pick ONE:

### Option 1 — CLI
```bash
DATABASE_URL='postgres://...' pnpm dlx @apitrail/cli init
```

### Option 2 — Print the SQL and run it in your DB console
```bash
pnpm dlx @apitrail/cli init --print
# Copy the output, paste into Supabase SQL editor / psql / etc.
```

### Option 3 — From code, on first run
Pass `autoMigrate: true` to the adapter (see "Full config reference" below). Only do this in dev or for one-off bootstraps; prefer the CLI for production.

The created table is `apitrail_spans` with 6 indexes. Schema is documented in `packages/postgres/src/schema.ts` in the apitrail repo.

## `instrumentation.ts` — the ONLY file you need to add

Next.js 15 reads this file from the project root automatically. Do not import it from anywhere else; Next.js calls `register()` once at server start.

> ### ⚠️ Critical: edge-safe pattern
>
> `instrumentation.ts` is compiled for **both** the Node and Edge runtimes. The Edge bundle MUST NOT pull in `@apitrail/postgres` (which depends on `pg`, a Node-only module). Static imports at the top of the file WILL be bundled for Edge and crash production with `ReferenceError: __import_unsupported is not defined` on every request.
>
> **Always use dynamic imports inside the Node-only branch of `register()`**, per [Vercel's official instrumentation pattern](https://nextjs.org/docs/app/guides/open-telemetry).

### Minimal (edge-safe — use this template)

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { defineConfig, register: apitrailRegister } = await import('apitrail')
  const { postgresAdapter } = await import('@apitrail/postgres')

  const config = defineConfig({
    adapter: postgresAdapter({
      connectionString: process.env.DATABASE_URL,
    }),
  })

  await apitrailRegister(config)
}
```

### Supabase (managed Postgres)

Supabase's pooler uses SSL with a self-signed cert. Pass `ssl.rejectUnauthorized: false`:

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { defineConfig, register: apitrailRegister } = await import('apitrail')
  const { postgresAdapter } = await import('@apitrail/postgres')

  await apitrailRegister(defineConfig({
    adapter: postgresAdapter({
      connectionString: process.env.DATABASE_URL,
      poolConfig: {
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      },
    }),
  }))
}
```

### Production-sensible defaults (full example)

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const {
    DEFAULT_MASK_KEYS,
    defineConfig,
    register: apitrailRegister,
  } = await import('apitrail')
  const { postgresAdapter } = await import('@apitrail/postgres')

  const config = defineConfig({
    serviceName: 'my-app',

    adapter: postgresAdapter({
      connectionString: process.env.DATABASE_URL,
      poolConfig: { ssl: { rejectUnauthorized: false } },
    }),

    skipPaths: [
      /^\/_next\//,
      /^\/favicon\./,
      '/robots.txt',
      '/sitemap.xml',
      '/manifest.webmanifest',
      '/api/health',
    ],

    slowMs: 500,
    sampling: {
      success: 0.1,  // 10 % of 2xx/3xx
      error: 1,      // all 4xx/5xx
      slow: 1,       // all requests above slowMs
    },

    maskKeys: [
      ...DEFAULT_MASK_KEYS,
      'passwordHash',
      'clientSecret',
      'stripe_secret',
    ],
  })

  await apitrailRegister(config)
}
```

## The FULL config reference (do not invent keys)

These are the **only** keys `defineConfig` accepts. Anything else is silently ignored at runtime even if TypeScript lets it through.

```ts
import type { ApitrailConfig, SamplingConfig, StorageAdapter } from 'apitrail'

const config: ApitrailConfig = {
  // ── Identity ──────────────────────────────────────────────────────────
  serviceName: 'my-app',                 // default: 'apitrail-app'

  // ── Storage ───────────────────────────────────────────────────────────
  adapter: postgresAdapter({ /* ... */ }), // default: consoleAdapter()

  // ── Filtering (all optional) ──────────────────────────────────────────
  skipPaths: [                           // request paths to skip (strings or RegExp)
    '/api/health',
    /^\/_next\//,
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],   // null = all (default)
  statusCodes: [200, 201, 400, 401, 403, 404, 500],     // null = all (default)

  // ── Capture toggles ───────────────────────────────────────────────────
  captureHeaders: true,                  // default: true
  captureBodies: true,                   // default: true
  captureChildren: true,                 // capture all child spans (default: true)
  maxBodySize: 10_000,                   // chars; -1 = unlimited (default: 10_000)

  // ── PII masking ───────────────────────────────────────────────────────
  maskKeys: ['password', 'my_custom_secret'], // extends over DEFAULT_MASK_KEYS

  // ── Performance ───────────────────────────────────────────────────────
  slowMs: 500,                           // requests above this are "slow" (default: 500)
  sampling: {
    success: 1,                          // 2xx/3xx           (default: 1)
    error: 1,                            // 4xx/5xx           (default: 1)
    slow: 1,                             // duration > slowMs (default: 1)
  },

  // ── Batching (adapter writes) ─────────────────────────────────────────
  batch: {
    maxSize: 50,                         // flush when this many spans queued
    intervalMs: 5000,                    // or every N ms, whichever comes first
  },

  // ── Misc ──────────────────────────────────────────────────────────────
  debug: false,                          // verbose startup logs (default: false)
}
```

### ⚠️ Common wrong keys

These keys **do not exist**. They come from naming that sounds logical but isn't in the real schema. Agents have invented them in the past — do NOT use:

| ❌ Wrong | ✅ Correct |
|---|---|
| `filter: { ignorePaths: [] }` | `skipPaths: []` |
| `filter: { ignoreMethods: [] }` | `methods: []` (allowlist; no direct blocklist) |
| `capture: { headers: true }` | `captureHeaders: true` |
| `capture: { bodies: true }` | `captureBodies: true` |
| `capture: { maxBodySize: 8000 }` | `maxBodySize: 8000` |
| `capture: { childSpans: true }` | `captureChildren: true` |
| `masking: { keys: [] }` | `maskKeys: []` |
| `masking: { additionalKeys: [] }` | `maskKeys: []` |
| `auth: () => boolean` (in Dashboard) | correct, **but** on `<Dashboard>`, not on the core config |

### Defaults already in `maskKeys`

These are redacted without you having to list them (case-insensitive, matched against JSON keys in bodies **and** header names):

```
password, passwd, pwd, token, access_token, refresh_token, id_token,
api_key, apikey, secret, client_secret, authorization, auth,
cookie, set-cookie, x-api-key, x-auth-token,
credit_card, creditcard, card_number, cvv, ssn
```

When you pass `maskKeys: [...]` in your config, **your list replaces the defaults entirely** — if you want to add to them, do:

```ts
import { DEFAULT_MASK_KEYS } from 'apitrail'

defineConfig({
  maskKeys: [...DEFAULT_MASK_KEYS, 'my_custom_secret'],
})
```

## Capture database queries (and other outgoing calls)

Every span apitrail sees ends up in `apitrail_spans` as a child of the root request span. Database query timings aren't captured by default — but they are one `instrumentation` away.

### Postgres (via `pg`, Drizzle, or any `pg`-based client)

```bash
pnpm add @opentelemetry/instrumentation-pg
```

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { defineConfig, register: apitrailRegister } = await import('apitrail')
  const { postgresAdapter } = await import('@apitrail/postgres')
  const { PgInstrumentation } = await import('@opentelemetry/instrumentation-pg')

  await apitrailRegister(
    defineConfig({
      adapter: postgresAdapter({ connectionString: process.env.DATABASE_URL }),
      otelInstrumentations: [new PgInstrumentation()],
    }),
  )
}
```

Now your waterfall includes every query:

```
GET /api/quotes 200 68ms
├─ INTERNAL  executing api route /api/quotes       45ms
│  ├─ CLIENT pg.query SELECT FROM quotes …         18ms
│  ├─ CLIENT pg.query SELECT FROM users …           5ms
│  └─ CLIENT pg.query SELECT FROM products …      15ms
└─ INTERNAL  start response                         <1ms
```

### Outgoing fetches

```bash
pnpm add @opentelemetry/instrumentation-fetch
```

Add `new FetchInstrumentation()` to `otelInstrumentations`. You'll see every `fetch('https://api.stripe.com/...')` in the waterfall with its duration, URL, method, and status.

### Other databases & clients

| Client | Package |
|---|---|
| MySQL | `@opentelemetry/instrumentation-mysql2` |
| MongoDB | `@opentelemetry/instrumentation-mongodb` |
| Redis | `@opentelemetry/instrumentation-redis-4` |
| ioredis | `@opentelemetry/instrumentation-ioredis` |
| AWS SDK | `@opentelemetry/instrumentation-aws-sdk` |

Same pattern — install, `new …Instrumentation()`, add to `otelInstrumentations`.

### Everything at once

```bash
pnpm add @opentelemetry/auto-instrumentations-node
```

```ts
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'

await apitrailRegister(defineConfig({
  adapter: postgresAdapter({ /* ... */ }),
  otelInstrumentations: getNodeAutoInstrumentations({
    // Next.js already handles HTTP tracing — disable the HTTP one to
    // avoid duplicate SERVER spans.
    '@opentelemetry/instrumentation-http': { enabled: false },
    '@opentelemetry/instrumentation-fs': { enabled: false },
  }),
}))
```

### What gets stored per query

Each query span is inserted into `apitrail_spans` as its own row with:

| Column | Value |
|---|---|
| `kind` | `CLIENT` |
| `name` | e.g. `pg.query:SELECT quotes` |
| `parent_span_id` | the span that issued the query (usually the route handler) |
| `duration_ms` | full query time including round-trip |
| `attributes` | `{db.system: "postgresql", db.statement: "SELECT …", db.name: "postgres"}` |
| `error_message` | populated if the query threw |

So you can query things like "which SQL is slowest this week":

```sql
SELECT
  attributes->>'db.statement' AS sql,
  count(*),
  avg(duration_ms)::int AS avg_ms,
  max(duration_ms) AS max_ms
FROM apitrail_spans
WHERE kind = 'CLIENT' AND attributes->>'db.system' = 'postgresql'
  AND created_at > now() - interval '7 days'
GROUP BY sql
ORDER BY avg_ms DESC
LIMIT 20;
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (picked up by your own code + passed to the adapter) |
| `APITRAIL_DATABASE_URL` | Optional override read by `@apitrail/cli` and `@apitrail/dashboard` if you want them on a different DB than your app |
| `POSTGRES_URL` | CLI fallback |
| `NO_COLOR=1` | Disables CLI color output |
| `APITRAIL_DEBUG=1` | Verbose error logs from the queue/processor |

## Optional: embed the dashboard

Create one file:

```tsx
// app/apitrail/[[...path]]/page.tsx
import { Dashboard } from '@apitrail/dashboard'
import '@apitrail/dashboard/styles.css'

export const dynamic = 'force-dynamic'

export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>
}) {
  return (
    <Dashboard
      params={params}
      poolConfig={{ ssl: { rejectUnauthorized: false } }}   // Supabase
      auth={async () => {
        // Your existing auth check. Return `false` to hide the dashboard.
        const session = await getServerSession()
        return session?.user?.role === 'admin'
      }}
    />
  )
}
```

Visit `/apitrail`. See `packages/dashboard/README.md` for all props.

## Troubleshooting

### "relation apitrail_spans does not exist"
The CLI init was never run. Run `pnpm dlx @apitrail/cli init` or `--print` the SQL into your DB.

### No data appears in Supabase after requests
1. Check the startup log — you should see `[apitrail] registered (adapter: postgres, bodies: true, children: true)` when `debug: true`.
2. Confirm `DATABASE_URL` is readable from the server-side process — a typo is the #1 cause.
3. The queue flushes every 5 s by default. Hit 50 requests or wait.
4. Watch for a warning like `[apitrail/postgres] error: ...` in your logs.

### `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` when running `pnpm dlx @apitrail/cli init`
Known bug in `0.1.0-alpha.0` where `workspace:*` leaked into the published manifest. Fixed in `0.1.0-alpha.1+`. Upgrade:
```bash
pnpm add apitrail@alpha @apitrail/postgres@alpha
```

### `ReferenceError: React is not defined` from the dashboard
The dashboard's JSX needs React 19 and the automatic JSX runtime. Make sure your `tsconfig.json` has `"jsx": "react-jsx"` or `"preserve"` and that React 19 is installed.

### Edge runtime warning: "A Node.js API is used (process.X)"
Expected and harmless as long as the message refers to a function inside a dynamically imported module (`./shutdown.js`, `./capture.js`). Apitrail guards these behind `process.env.NEXT_RUNTIME !== 'edge'` and only actually executes them in Node.

### `ReferenceError: __import_unsupported is not defined` on every route in production
Your `instrumentation.ts` has a **static import** of `apitrail` or `@apitrail/postgres` at the top of the file. That bundles Node-only modules (`pg`, `net`, `crypto`) into the Edge middleware bundle, which crashes on the first request.

Fix: move the imports inside `register()`, gated behind a `NEXT_RUNTIME` check. See the "edge-safe pattern" at the top of this document.

```ts
// WRONG — do not do this:
import { defineConfig, register as apitrailRegister } from 'apitrail'
import { postgresAdapter } from '@apitrail/postgres'

export const register = () => apitrailRegister(/* ... */)

// CORRECT — edge-safe:
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { defineConfig, register: apitrailRegister } = await import('apitrail')
  const { postgresAdapter } = await import('@apitrail/postgres')
  // ... rest of config
}
```

### The config is accepted but nothing changes
You're passing invented keys (see "Common wrong keys" above). TypeScript may or may not catch them depending on how you construct the object; runtime silently ignores extras. Compare your object against the `ApitrailConfig` type — that's the canonical shape.

## Inspect what got captured

```bash
# From anywhere — points the CLI at your DB
DATABASE_URL='postgres://...' pnpm dlx @apitrail/cli status --limit 20
```

Output:

```
apitrail status
─────────────────────────────────────────────
table       : apitrail_spans
total rows  : 15432
last 24h    : 1240
errors 24h  : 3
slow 24h    : 12 (>500ms)
spans/kind  : SERVER=3892, INTERNAL=11540

recent 20 requests:
...
```

Or query directly:

```sql
-- The root request rows
SELECT method, path, status_code, duration_ms, created_at, req_body, res_body
FROM apitrail_spans
WHERE kind = 'SERVER'
ORDER BY created_at DESC
LIMIT 50;

-- The child-span waterfall for a trace
SELECT name, kind, duration_ms, start_time
FROM apitrail_spans
WHERE trace_id = '…'
ORDER BY start_time;

-- Slow endpoints in the last day
SELECT path, count(*), avg(duration_ms)::int AS avg_ms
FROM apitrail_spans
WHERE kind = 'SERVER' AND created_at > now() - interval '24 hours'
GROUP BY path
HAVING avg(duration_ms) > 300
ORDER BY avg_ms DESC;
```

## Deploying to Vercel

Nothing special. Set `DATABASE_URL` in Vercel env. SSL works out of the box because you're passing `poolConfig.ssl` in code — no need for `NODE_TLS_REJECT_UNAUTHORIZED`.
