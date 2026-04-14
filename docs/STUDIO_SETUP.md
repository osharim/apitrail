# apitrail studio — setup walkthrough

A step-by-step guide to running `@apitrail/studio` against your own database. No prior setup assumed.

## What you need

- A Next.js (or any Node) app that already uses `apitrail` (see [INTEGRATING.md](../INTEGRATING.md)), OR at minimum an existing `apitrail_spans` table in a Postgres-compatible DB.
- Postgres connection string, typically `DATABASE_URL`.
- Node **≥ 20** on the machine you'll run studio on.

## One-minute path (local)

```bash
DATABASE_URL='postgres://…' pnpm dlx @apitrail/studio
```

That's it. A browser tab opens at `http://127.0.0.1:4545` with live data.

If the table doesn't exist yet:

```bash
pnpm dlx @apitrail/cli init
```

Then re-run studio.

## Detailed walkthrough

### 1. Verify the table is present

```bash
DATABASE_URL='postgres://…' pnpm dlx @apitrail/cli status
```

Expected output:

```
apitrail status
─────────────────────────────────────────────
table       : apitrail_spans
total rows  : 15432
last 24h    : 1240
…
```

If you get `relation "apitrail_spans" does not exist`, run `pnpm dlx @apitrail/cli init` first.

### 2. Choose your binding

Studio listens on `127.0.0.1:4545` by default. That means **only you**, on your machine, can reach it. Nothing else is needed for local dev.

| Use case | Binding | Auth required? |
|---|---|---|
| Local dev on your laptop | `127.0.0.1` (default) | No |
| Shared team dev server on LAN | `0.0.0.0` | Yes — `--auth-basic` |
| Staging box behind a reverse proxy | `127.0.0.1` (proxy handles ingress) | Recommended |
| Public internet | **Not supported directly.** Put it behind a proxy with stronger auth. |

### 3. Start it

#### Local

```bash
pnpm dlx @apitrail/studio --db "$DATABASE_URL"
```

Output:

```
  ● apitrail studio v0.1.0-alpha.1
  → http://127.0.0.1:4545
  Press Ctrl+C to stop.
```

If the browser doesn't open automatically (CI, SSH session, etc.), pass `--no-open` and visit the URL manually.

#### Team dev server (LAN)

```bash
APITRAIL_STUDIO_AUTH="alice:$(openssl rand -hex 16)" \
pnpm dlx @apitrail/studio \
  --db "$DATABASE_URL" \
  --host 0.0.0.0 \
  --port 4545
```

Share the URL + credentials with your team in 1Password/Bitwarden.

If you pass `--host 0.0.0.0` without `--auth-basic` or `APITRAIL_STUDIO_AUTH`, studio refuses to start — it will not expose your logs to the network unauthenticated.

### 4. Custom table name

If you used a non-default table name when installing apitrail:

```bash
pnpm dlx @apitrail/studio --db "$DATABASE_URL" --table my_custom_logs
```

### 5. Supabase / managed Postgres

Most managed Postgres providers use SSL with certs that Node's default validator rejects. Studio's pg client passes `{ ssl: { rejectUnauthorized: false } }` when `--no-ssl` is NOT set (which is the default). For most Supabase-style setups, you don't need any extra flags.

If your provider has a strict SSL policy and your connection string already encodes `sslmode=...`, you can opt out of studio's default:

```bash
pnpm dlx @apitrail/studio --db "$DATABASE_URL?sslmode=require" --no-ssl
# (then pg uses the sslmode from the URL only)
```

### 6. Running as a service

If you want studio to persist on a dev server:

```ini
# /etc/systemd/system/apitrail-studio.service
[Unit]
Description=apitrail studio
After=network-online.target

[Service]
Environment=APITRAIL_DATABASE_URL=postgres://…
Environment=APITRAIL_STUDIO_AUTH=alice:longsecret
ExecStart=/usr/bin/env pnpm dlx @apitrail/studio --host 0.0.0.0 --port 4545
Restart=always
User=apitrail

[Install]
WantedBy=multi-user.target
```

Then put nginx or Caddy in front for TLS:

```caddy
apitrail.mycompany.com {
  reverse_proxy 127.0.0.1:4545
}
```

### 7. Running in Docker

```dockerfile
FROM node:22-alpine
RUN corepack enable
WORKDIR /app
RUN pnpm add @apitrail/studio
CMD ["pnpm", "exec", "apitrail-studio", "--host", "0.0.0.0"]
```

```bash
docker run -p 4545:4545 \
  -e APITRAIL_DATABASE_URL="postgres://…" \
  -e APITRAIL_STUDIO_AUTH="alice:longsecret" \
  apitrail-studio
```

## Reading the UI

### Overview cards

- **Requests · 24h** — SERVER spans (root HTTP requests) in the last 24 hours; `rpm avg` below is the per-minute rate.
- **Errors · 24h** — spans with `status_code >= 400`. Red when > 0.
- **Slow · 24h** — spans with `duration_ms > 500`. Amber when > 0.
- **p50 / p95** — latency percentiles computed by Postgres over 24 hours.

### Requests table

- **Color tones** on method and status communicate semantics at a glance. Duration goes amber > 500 ms, red > 1 s.
- **Click or Enter/Space** on a row to open its detail drawer.
- **Filters** update the URL-free table state; refresh combines with polling (every 5 s).

### Trace detail drawer

The right-side drawer has four sections:

1. **Meta** — `trace_id`, `span_id`, route pattern, runtime (`nodejs` / `edge`), host, client IP, user agent, referer, start time.
2. **Waterfall** — one row per child span in the trace, positioned and sized proportionally within the root duration. Violet bars are normal; rose bars are errored. Next.js child spans you'll commonly see:
   - `resolve page components` — framework routing
   - `executing api route (app) …` — your route handler body
   - `start response` — shipping the response
   - `fetch …` — outgoing fetches (if your code made any)
3. **Request** — headers and body at ingress. Headers listed as JSON; body pretty-printed if it was JSON.
4. **Response** — same for egress.

Any value matching `maskKeys` (including nested JSON keys and Authorization-style headers) shows as `***MASKED***`.

## Troubleshooting

### `error: no database URL`
Pass `--db` or set `APITRAIL_DATABASE_URL` / `DATABASE_URL` / `POSTGRES_URL`.

### `Could not connect to Postgres: …`
The message comes straight from the pg client. Common causes: wrong password, wrong host, or the provider's IP allowlist doesn't include your machine. Try the connection with `psql "$DATABASE_URL"` first.

### `error: refusing to bind to 0.0.0.0 without --auth-basic`
Security guard. Add `--auth-basic user:pass` or use `--host 127.0.0.1`.

### The UI shows "Failed to load overview"
Check the studio's stdout — it logs the underlying SQL error as `[studio][error] overview failed`. Usually this means the table is missing, the column schema doesn't match (older apitrail alpha version), or the user in your connection string can't read the table.

### Studio works but shows zero requests
Make sure your app is still writing to the database. Run:

```sql
SELECT count(*), max(created_at) FROM apitrail_spans;
```

If `max(created_at)` is stale, the problem is on the app side (maybe `register()` didn't run — check for `[apitrail] registered` in your app's startup logs).

### Port 4545 already in use
```bash
pnpm dlx @apitrail/studio --port 4546
```

## Keyboard shortcuts (future)

Currently the only shortcut is `Enter` / `Space` on a focused row to open its detail. Broader shortcut support is on the roadmap.

## Stopping studio

`Ctrl+C` in the terminal. Studio closes the Postgres pool gracefully and exits. Your data stays in the database.
