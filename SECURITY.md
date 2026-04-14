# Security policy and threat model

apitrail captures HTTP traffic from your app, including bodies and headers, and persists it to a database you own. That makes it a **sensitive data system** — this document describes the threat model we design for, the controls we ship by default, and the configuration you are expected to bring yourself.

## Reporting a vulnerability

Do **not** open a public GitHub issue for security problems.

- Email `security@apitrail.io` (or use GitHub's private vulnerability reporting on the repo).
- Include a reproducer, affected versions, and any suggested fix.
- We acknowledge within 48 hours and coordinate disclosure.

During alpha, only the latest published version receives patches.

## Threat model

### In scope

| Threat | Status |
|---|---|
| SQL injection via user-controlled input to the adapter / dashboard / studio | Mitigated — all values parameterized, identifiers regex-whitelisted |
| Prototype pollution via hostile JSON bodies | Mitigated — `__proto__` / `constructor` / `prototype` keys dropped during masking, depth capped at 32 |
| Secrets leaking into the database via unmasked bodies, headers, or query strings | Mitigated — sensible default mask list + query-string stripping |
| Credential exposure in logs or stdout | Mitigated — connection strings never logged, errors sanitized in studio API |
| Studio reachable from the network without authentication | Mitigated — refuses to start on non-loopback hosts without `--auth-basic` |
| DoS via unbounded query parameters | Mitigated — integer bounds checking, path substring length cap, rate limiter |
| Path traversal serving static UI | Mitigated — Hono's `serveStatic` resolves paths relative to a root |
| XSS in the dashboard/studio rendering captured request bodies | Mitigated — React escapes all text nodes; bodies rendered inside `<pre>` |
| Supply chain: malicious dependency | Partial — provenance attestations enabled for npm publish via Trusted Publishing; Dependabot security updates active |

### Out of scope (your responsibility)

| Concern | Why it's your problem |
|---|---|
| TLS for the Postgres connection | You pick the provider. Use `sslmode=require` in your connection string; for Supabase pass `poolConfig: { ssl: { rejectUnauthorized: false } }`. |
| Network authentication to your database | You configure Postgres/Supabase users, IP allowlists, roles. |
| Authentication / RBAC on the **embeddable** dashboard | You wire the `auth` callback to your session layer. |
| Exposing studio over the internet | Put it behind a reverse proxy with TLS + stronger auth. Basic auth is a development convenience, not a perimeter. |
| Retention of sensitive data in the database | Set a cron / scheduled job to delete rows older than your retention window. |
| Secrets management | Pass `DATABASE_URL` via your platform's secret store (Vercel env, AWS SSM, etc.). Never commit it. |

## Built-in controls

### Masking

Every JSON-shaped request/response body is parsed and traversed; values under keys that match `maskKeys` (case-insensitive) are replaced with `***MASKED***` before being written to the adapter. Same applies to HTTP headers.

The default `maskKeys` list covers the common cases:

```
password, passwd, pwd,
token, access_token, refresh_token, id_token,
api_key, apikey, secret, client_secret,
authorization, auth, cookie, set-cookie,
x-api-key, x-auth-token,
credit_card, creditcard, card_number, cvv, ssn
```

Add your own with:

```ts
import { DEFAULT_MASK_KEYS, defineConfig } from 'apitrail'

defineConfig({
  maskKeys: [...DEFAULT_MASK_KEYS, 'my_app_specific_secret', 'stripe_secret'],
})
```

### Query-string stripping

URLs like `/api/webhook?api_key=SECRET` are split before storage. The `path` column receives `/api/webhook`. The query portion is redacted against the same `maskKeys` list and stored in `attributes.url.query_masked`. Secrets passed via query string never land unmasked in the database.

### Body size cap

Bodies larger than `maxBodySize` (default 10 000 chars) are truncated with a visible marker. Prevents a pathological request body from filling your disk.

### Sampling

By default all requests are kept. In production, tune:

```ts
sampling: {
  success: 0.1,   // keep 10 % of 2xx/3xx
  error: 1,       // keep all 4xx/5xx
  slow: 1,        // keep all requests over slowMs
}
```

Lower sampling means less surface for a data-leak incident and lower storage cost.

### Studio binding

`@apitrail/studio` binds to `127.0.0.1` by default. It will **refuse to start** if you pass `--host 0.0.0.0` (or any non-loopback) without `--auth-basic user:pass`.

When auth is enabled:
- The password is compared in constant time against a SHA-256 hash to avoid timing leaks.
- The server sets `WWW-Authenticate: Basic realm="apitrail studio"` on challenge.

### HTTP security headers on studio

Every response carries:

```
Content-Security-Policy:  default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'
X-Content-Type-Options:   nosniff
X-Frame-Options:          DENY
Referrer-Policy:          no-referrer
Permissions-Policy:       interest-cohort=()
X-Robots-Tag:             noindex, nofollow
```

The `connect-src 'self'` line means the UI will not make requests to any host other than studio itself — a compromised UI bundle cannot exfiltrate by calling out. `frame-ancestors 'none'` prevents clickjacking.

### Rate limiting on studio

Studio's `/api/*` routes are rate-limited at 300 requests per minute per client IP. This is a friendly-fire guard (rogue tab spamming refresh, accidental curl loop) — not a production rate limiter. Put a real one in front if studio is exposed.

### Provenance

All packages are published to npm with `publishConfig.provenance = true`, meaning npm records a signed attestation pointing to the GitHub Actions workflow that built them. Verifiable via:

```bash
npm audit signatures apitrail
```

## Deployment patterns

### Local dev (default)

```bash
pnpm dlx @apitrail/studio --db $DATABASE_URL
```

Binds to 127.0.0.1. Only processes on your machine can reach it. No auth needed.

### Team dev server

```bash
apitrail-studio \
  --host 0.0.0.0 \
  --port 4545 \
  --auth-basic "$APITRAIL_STUDIO_AUTH"
```

Bind-to-all + basic auth. Put behind an nginx / Caddy / Cloudflare Tunnel reverse proxy that terminates TLS. Example Caddy:

```caddy
apitrail.mycompany.internal {
  reverse_proxy 127.0.0.1:4545
}
```

### Embedded dashboard in a production app

See [INTEGRATING.md](./INTEGRATING.md). You MUST pass an `auth` callback:

```tsx
<Dashboard
  params={params}
  auth={async () => {
    const session = await getServerSession()
    return session?.user?.role === 'admin'
  }}
/>
```

Without an `auth` callback, anyone hitting `/apitrail` in your app sees every captured request body.

## Retention

We don't run a scheduled cleanup for you. A minimal retention policy in Postgres:

```sql
-- Delete spans older than 30 days
DELETE FROM apitrail_spans WHERE created_at < now() - interval '30 days';
```

Run it from pg_cron (Supabase has it built in) or your platform's scheduler. Document the retention window in your own privacy notice.

## Dependency hygiene

- `npm audit` is run in CI on every PR.
- Dependabot opens security-update PRs automatically.
- Peer dependencies are pinned to minimum working ranges (`next >= 15`, `pg >= 8`, `react >= 19`).
- Zero runtime dependencies in the `apitrail` core beyond OTEL primitives.

## Verifying a release

```bash
# Confirm the package is ours and was built by the official workflow
npm view apitrail dist.signatures
npm audit signatures apitrail @apitrail/postgres @apitrail/cli @apitrail/studio @apitrail/dashboard
```

## Known limitations

- Body capture uses monkey-patched `Request.prototype` / `Response` constructor. A future Next.js release could change internals in a way that breaks capture silently. We run the example app against Next 15 and 16 in CI to catch this, but cannot guarantee against all versions.
- The in-process batch queue loses up to `batch.intervalMs` worth of spans if the Node process dies (e.g. Vercel function timeout during graceful shutdown). Accept this trade-off or switch to a durable queue.
- Masking is key-based, not value-based — a secret that isn't under a known key name will not be masked. Add your app's keys to `maskKeys`.

## Changelog for security

Security-relevant changes are tagged in `CHANGELOG.md`. Version bumps that fix a published vulnerability are released with a notice within 24 hours of the fix landing.
