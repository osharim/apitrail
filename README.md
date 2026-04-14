# apitrail

> The API logger for Next.js (and beyond) — your data, your database.

[![CI](https://github.com/osharim/apitrail/actions/workflows/ci.yml/badge.svg)](https://github.com/osharim/apitrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Drop-in request / response logging for Next.js App Router. Built on OpenTelemetry. Stores spans — bodies, headers, status, durations, and the full waterfall of child spans — **in your own database**. Zero SaaS. Zero extra infra.

## Why

Existing options are either SaaS (your data leaves your infra) or heavy self-hosted stacks (ClickHouse + collector + UI). `apitrail` is the missing middle: `npm install`, one line in `instrumentation.ts`, logs in your Postgres.

## Quick start

```bash
pnpm add apitrail @apitrail/postgres
pnpm dlx @apitrail/cli init           # creates the apitrail_spans table
```

```ts
// instrumentation.ts
import { defineConfig, register as apitrailRegister } from 'apitrail'
import { postgresAdapter } from '@apitrail/postgres'

const config = defineConfig({
  adapter: postgresAdapter({ connectionString: process.env.DATABASE_URL }),
})

export const register = () => apitrailRegister(config)
```

Done. Every request to your Next.js app is now persisted.

## What gets captured

| Field | On every span | On HTTP `SERVER` spans |
|---|---|---|
| trace_id, span_id, parent_span_id | ✅ | ✅ |
| name, kind, status, duration | ✅ | ✅ |
| method, path, status_code | — | ✅ |
| req/res headers | — | ✅ (redacted) |
| req/res bodies | — | ✅ (redacted) |
| error message + stack | on exception | on exception |

Child spans (`INTERNAL`, `CLIENT`) are captured by default — you get the full waterfall of every request (route execution, fetches, DB calls) via `parent_span_id`.

## Packages

| Package | Description |
|---|---|
| [`apitrail`](./packages/apitrail) | Core — register, OTEL processor, capture, masking |
| [`@apitrail/postgres`](./packages/postgres) | Postgres storage adapter |
| [`@apitrail/cli`](./packages/cli) | `apitrail init` / `status` / `drop` |
| [`@apitrail/studio`](./packages/studio) | Standalone dev dashboard — `pnpm dlx @apitrail/studio` |
| [`@apitrail/dashboard`](./packages/dashboard) | Embeddable Next.js Server Component (alternative to studio) |

## Configuration

```ts
defineConfig({
  adapter: postgresAdapter({ connectionString: process.env.DATABASE_URL }),

  // Filtering
  skipPaths: ['/api/health', /^\/_next\//],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],

  // Capture controls
  captureHeaders: true,
  captureBodies: true,
  captureChildren: true,      // full span waterfall
  maxBodySize: 10_000,        // chars; -1 = unlimited

  // PII masking (keys are case-insensitive, applied to JSON bodies + headers)
  maskKeys: ['password', 'token', 'authorization', 'cookie', /* ...defaults */],

  // Sampling (per category — all default to 1.0 = keep all)
  slowMs: 500,
  sampling: { success: 0.1, error: 1, slow: 1 },

  // Batch
  batch: { maxSize: 50, intervalMs: 5000 },
})
```

## Status

**Alpha** — v0.1.x. APIs may change before 1.0.

## Roadmap

- [x] Core: OTEL-based capture
- [x] Request/response body + header capture
- [x] PII masking with sensible defaults
- [x] Per-category sampling (success / error / slow)
- [x] Full span waterfall capture
- [x] Postgres adapter (`@apitrail/postgres`)
- [x] CLI (`@apitrail/cli`) — init / status / drop
- [x] Embeddable dashboard (`@apitrail/dashboard`)
- [x] Standalone studio (`@apitrail/studio`) — Prisma-Studio-style dev tool
- [ ] Live tail (SSE), full-text search, error grouping in studio
- [ ] MongoDB, MySQL, SQLite adapters
- [ ] Docs site

## License

MIT
