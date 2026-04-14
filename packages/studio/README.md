# @apitrail/studio

> **Prisma-Studio-style standalone dashboard** for [apitrail](https://github.com/osharim/apitrail). `pnpm dlx @apitrail/studio` → `localhost:4545` → beautiful dark UI with KPIs, filters, and Chrome-DevTools-style waterfalls of every captured request. No embedding, no auth gymnastics.

[![npm](https://img.shields.io/npm/v/@apitrail/studio/alpha?color=a78bfa&label=npm)](https://www.npmjs.com/package/@apitrail/studio)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 60-second quick start

```bash
DATABASE_URL='postgres://…' pnpm dlx @apitrail/studio
```

A browser tab opens at `http://127.0.0.1:4545`. If the table doesn't exist yet:

```bash
pnpm dlx @apitrail/cli init
```

## Why a separate server?

The embeddable `@apitrail/dashboard` is Server-Component-only — limited interactivity, CSS constrained by the host app, auth has to be wired manually. `@apitrail/studio` is the opposite:

- **Full SPA** — React 19, client-side state, URL-shareable filters, polling refresh
- **Its own server** — Hono + tiny JSON API, no Next.js weight
- **Not in your app bundle** — ship `apitrail` core to prod, run studio only in dev / ops
- **Works with any framework** — as long as the data lives in `apitrail_spans`

## CLI

```bash
apitrail-studio [options]
pnpm dlx @apitrail/studio [options]
```

| Flag | Default | Description |
|---|---|---|
| `--db <url>` | `$APITRAIL_DATABASE_URL` / `$DATABASE_URL` / `$POSTGRES_URL` | Postgres connection string |
| `--port <n>` | `4545` | HTTP port |
| `--host <addr>` | `127.0.0.1` | Bind address. Use `0.0.0.0` for LAN (**requires `--auth-basic`**) |
| `--table <name>` | `apitrail_spans` | Span table to read from |
| `--auth-basic <u:p>` | — | Enable HTTP Basic Auth. **Required when host is non-loopback.** |
| `--no-ssl` | — | Disable SSL on the pg connection |
| `--no-open` | — | Don't auto-open the browser |
| `--dev` | — | CORS on, skip serving the built UI (for developing studio itself) |
| `-v`, `--version` | — | Print version |
| `-h`, `--help` | — | Show help |

### Environment

| Variable | Purpose |
|---|---|
| `APITRAIL_DATABASE_URL` | Preferred connection string |
| `DATABASE_URL` | Fallback |
| `POSTGRES_URL` | Fallback |
| `APITRAIL_STUDIO_AUTH` | `user:pass` for basic auth (alternative to `--auth-basic`) |
| `NO_COLOR=1` | Disable colored CLI output |

## What you see

| View | Contents |
|---|---|
| **Overview** | Requests/24h, errors, slow, p50, p95 — polls every 10 s |
| **Requests explorer** | Method / status-class / path-substring filters, 5 s polling, Enter/Space on a focused row opens the detail drawer |
| **Trace detail drawer** | Full meta (trace_id, span_id, route, runtime, host, UA, referer), Chrome-DevTools-style waterfall of child spans, Request / Response headers + bodies pretty-printed with masking applied |

## Deployment patterns

### Local dev (default)

```bash
pnpm dlx @apitrail/studio
```

Binds `127.0.0.1:4545`. Only processes on your machine can reach it. No auth needed.

### Team dev server on LAN

```bash
APITRAIL_STUDIO_AUTH="alice:$(openssl rand -hex 16)" \
  pnpm dlx @apitrail/studio --host 0.0.0.0
```

If you try `--host 0.0.0.0` **without** auth, studio refuses to start. This is intentional — your logs contain bodies and headers that may include sensitive data even after masking.

### Behind a reverse proxy with TLS

```caddy
apitrail.mycompany.com {
  reverse_proxy 127.0.0.1:4545
}
```

See the full walkthrough in [docs/STUDIO_SETUP.md](https://github.com/osharim/apitrail/blob/main/docs/STUDIO_SETUP.md).

## Security

- **Default binding: `127.0.0.1`.** Only your machine reaches studio.
- **Refuses to start on non-loopback without `--auth-basic`.** Enforced at CLI parse time.
- **HTTP Basic Auth** uses constant-time SHA-256 comparison (no timing-leak).
- **Strict response headers** on every request:
  ```
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'
  X-Content-Type-Options:  nosniff
  X-Frame-Options:         DENY
  Referrer-Policy:         no-referrer
  X-Robots-Tag:            noindex, nofollow
  ```
- **Rate limit** on `/api/*`: 300 req/min/IP.
- **Parametrised SQL** — every value binds through pg. Identifier regex-whitelisted. Trace IDs must match `/^[0-9a-f]{32}$/`.
- **Strict numeric validation** — `/api/spans?minStatus=…` refuses floats, scientific notation, hex, trailing garbage.
- **Sanitised error responses** — 500s return `{"error":"internal error"}`; the real SQL / stack trace is logged server-side only.

Full threat model in [SECURITY.md](https://github.com/osharim/apitrail/blob/main/SECURITY.md).

## Roadmap

- ⏳ Live tail over SSE
- ⏳ Full-text search in request/response bodies
- ⏳ Error grouping by stack fingerprint
- ⏳ Per-endpoint latency percentile charts
- ⏳ Saved filter presets in the URL
- ⏳ Keyboard shortcuts (⌘K command palette)

## License

MIT — [full repo](https://github.com/osharim/apitrail)
