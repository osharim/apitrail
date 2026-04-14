# @apitrail/studio

> Standalone dev dashboard for [apitrail](https://apitrail.io). Run `pnpm dlx @apitrail/studio --db $DATABASE_URL` and get a real-time UI on `localhost:4545`.

Think of this as **Prisma Studio for your API logs**. No embedding, no auth gymnastics, no production weight — just a beautiful standalone tool for monitoring, debugging, and exploring what your Next.js app is doing.

## Why standalone?

The embeddable `@apitrail/dashboard` is Server-Component-only (no client interactivity, limited styling flexibility). `@apitrail/studio` is the opposite:

- **Full SPA** — React 19, client-side state, URL filters, polling refresh, eventually live tail over SSE
- **Its own server** — Hono, tiny JSON API, no Next.js weight
- **Not in your app bundle** — ship `apitrail` core to prod, run studio only in dev / ops
- **Works with any framework** — as long as the data lives in `apitrail_spans`

## Usage

```bash
# One-off via dlx (no global install)
pnpm dlx @apitrail/studio --db $DATABASE_URL

# Install globally and run
pnpm add -g @apitrail/studio
apitrail-studio --db postgres://…
```

Output:

```
  ● apitrail studio v0.1.0-alpha.0
  → http://127.0.0.1:4545
  Press Ctrl+C to stop.
```

## Options

| Flag | Default | Description |
|---|---|---|
| `--db <url>` | `$APITRAIL_DATABASE_URL`, `$DATABASE_URL`, `$POSTGRES_URL` | Connection string |
| `--port <n>` | `4545` | HTTP port |
| `--host <addr>` | `127.0.0.1` | Bind address. Use `0.0.0.0` for LAN |
| `--table <name>` | `apitrail_spans` | Span table to read from |
| `--no-ssl` | — | Disable SSL on the pg connection |
| `--no-open` | — | Don't auto-open the browser |
| `--dev` | — | Enable CORS, skip UI serving (only JSON API — used when developing studio itself) |

## Features (v0.1)

- **Overview** — requests/24h, errors, slow, p50, p95 (polling every 10 s)
- **Requests explorer** — method / status-class / path filters, sticky top, selectable rows
- **Trace detail** — side drawer with meta, waterfall of child spans, request/response headers + bodies (JSON pretty-printed)
- **Dark, fast, keyboard-friendly** — no framework overhead on the wire

## Roadmap (v0.2+)

- Live tail via SSE
- Full-text search in bodies
- Error grouping by fingerprint
- Endpoint analytics (per-path latency percentiles)
- Saved filter presets in URL
- Auth for remote deployments (`--auth-basic user:pass` or an `--auth-token`)

## Security

Studio has **no built-in auth**. Default binding is `127.0.0.1` so only your machine can reach it. If you bind to `0.0.0.0` or run it remotely, put it behind a reverse proxy with your own auth — it reads raw request bodies and headers from apitrail, which may include sensitive data even after the masking layer.

## License

MIT
