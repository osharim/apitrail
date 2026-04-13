# apitrail

> The API logger for Next.js (and beyond) — your data, your database.

[![npm version](https://img.shields.io/npm/v/apitrail.svg)](https://www.npmjs.com/package/apitrail)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Drop-in request/response logging for Next.js App Router. Built on OpenTelemetry. Stores logs **in your own database**. Zero external services. Zero config.

## Why

Existing options are either SaaS (your data leaves your infra) or heavy self-hosted stacks (ClickHouse + collector + UI). `apitrail` is the missing middle: `npm install`, one line in `instrumentation.ts`, logs in your Postgres.

## Install

```bash
npm install apitrail
# or
pnpm add apitrail
```

## Usage

```ts
// instrumentation.ts
export { register } from 'apitrail'
```

That's it. Every request to your Next.js app is now captured.

## Status

**Alpha** — v0.1.0 under active development. APIs may change.

## Roadmap

- [x] Core: OTEL-based capture via `instrumentation.ts`
- [x] Console adapter (default, dev)
- [ ] Postgres adapter (`@apitrail/postgres`)
- [ ] Request/response body capture
- [ ] PII masking + sampling
- [ ] Dashboard (`@apitrail/dashboard`)
- [ ] MongoDB, MySQL, SQLite adapters
- [ ] CLI (`apitrail init`)

## License

MIT
