# apitrail

> Self-hosted request logging for Next.js. Captures every HTTP request — method, path, status, duration, bodies, headers, and the **full child-span waterfall** — persisted to **your own Postgres**. Zero SaaS.

[![npm](https://img.shields.io/npm/v/apitrail/alpha?color=a78bfa&label=npm)](https://www.npmjs.com/package/apitrail)
[![Downloads](https://img.shields.io/npm/dm/apitrail?color=a78bfa)](https://www.npmjs.com/package/apitrail)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This is the **core** package. For the full picture and an end-to-end setup guide, see the [repo README](https://github.com/osharim/apitrail) or [INTEGRATING.md](https://github.com/osharim/apitrail/blob/main/INTEGRATING.md).

## The one-liner

```bash
pnpm dlx apitrail install
```

That's the fastest path — it detects your stack, installs everything, writes your `instrumentation.ts`, creates the table, and (if you have `pg` / `drizzle-orm` / `ioredis` / etc.) offers to wire up query timings.

## Manual install

```bash
pnpm add apitrail @apitrail/postgres pg
```

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { defineConfig, register: apitrailRegister } = await import('apitrail')
  const { postgresAdapter } = await import('@apitrail/postgres')

  await apitrailRegister(
    defineConfig({
      adapter: postgresAdapter({ connectionString: process.env.DATABASE_URL }),
    }),
  )
}
```

> **Why the dynamic imports?** `@apitrail/postgres` pulls in `pg`, which is Node-only. Next.js builds `instrumentation.ts` for BOTH Node and Edge runtimes — if you static-import at the top, the Edge middleware bundle breaks with `ReferenceError: __import_unsupported is not defined`. Dynamic imports inside the `NEXT_RUNTIME !== 'nodejs'` guard are the supported pattern.

## Features

- **Zero-config DB query timings.** Install `@opentelemetry/instrumentation-pg` and apitrail auto-detects it at startup — no config change needed. Same for `fetch`, Redis, MongoDB, MySQL, AWS-SDK, GraphQL.
- **Full waterfall.** Every child span (route handler, fetch, SQL query, render) is linked via `parent_span_id` and persisted.
- **Body + header capture with PII masking.** Defaults cover `password`, `token`, `authorization`, `cookie`, `api_key`, `credit_card`, `cvv`, `ssn`. Add your own with `maskKeys`.
- **Query-string secret stripping.** `?api_key=SECRET` is split before storage; the canonical `path` never holds secrets.
- **Edge-safe.** Refuses to load Node modules in Edge runtime; the Postgres adapter lazy-loads `pg`.
- **Batched writes with deferred stringify.** Zero apparent latency on the request path.
- **Per-category sampling.** Keep 100 % of errors and slow requests, 10 % of successes.
- **Pluggable adapters.** Postgres today. MongoDB / MySQL / SQLite on the roadmap.

## Full config reference

```ts
import type { ApitrailConfig } from 'apitrail'

const config: ApitrailConfig = {
  // ── Identity ──────────────────────────────────────────────────────────
  serviceName: 'my-app',                 // default: 'apitrail-app'

  // ── Storage ───────────────────────────────────────────────────────────
  adapter: postgresAdapter({ /* ... */ }),  // default: consoleAdapter()

  // ── Filtering (all optional) ──────────────────────────────────────────
  skipPaths: [                           // strings or RegExp
    '/api/health',
    /^\/_next\//,
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],   // null = all (default)
  statusCodes: [200, 201, 400, 401, 403, 404, 500],     // null = all (default)

  // ── Capture toggles ───────────────────────────────────────────────────
  captureHeaders: true,                  // default: true
  captureBodies: true,                   // default: true
  captureChildren: true,                 // capture child spans (default: true)
  maxBodySize: 10_000,                   // chars; -1 = unlimited (default: 10_000)

  // ── PII masking ───────────────────────────────────────────────────────
  maskKeys: ['password', 'my_custom_secret'],  // list replaces defaults; use
                                                // [...DEFAULT_MASK_KEYS, 'x'] to extend

  // ── OTEL instrumentations ─────────────────────────────────────────────
  autoInstrument: true,                  // default: true — auto-detect installed
                                         //   @opentelemetry/instrumentation-* packages
  otelInstrumentations: [],              // extra OTEL instances (optional)

  // ── Performance ───────────────────────────────────────────────────────
  slowMs: 500,                           // default: 500
  sampling: {
    success: 1,                          // 2xx/3xx           (default: 1)
    error: 1,                            // 4xx/5xx           (default: 1)
    slow: 1,                             // duration > slowMs (default: 1)
  },

  // ── Batching ──────────────────────────────────────────────────────────
  batch: { maxSize: 50, intervalMs: 5000 },

  debug: false,
}
```

## Ecosystem

| Package | What it does |
|---|---|
| [`@apitrail/postgres`](https://www.npmjs.com/package/@apitrail/postgres) | Postgres storage adapter |
| [`@apitrail/cli`](https://www.npmjs.com/package/@apitrail/cli) | `apitrail install / init / status / drop` |
| [`@apitrail/studio`](https://www.npmjs.com/package/@apitrail/studio) | Standalone dashboard — Prisma-Studio-style |
| [`@apitrail/dashboard`](https://www.npmjs.com/package/@apitrail/dashboard) | Embeddable Next.js Server Component |

## Bundled adapters

- `apitrail/adapters/console` — logs spans to stdout (default when no adapter is passed)

## License

MIT — [full repo](https://github.com/osharim/apitrail)
