# @apitrail/cli

> One command to set up [apitrail](https://github.com/osharim/apitrail) in any Next.js project. Detects your stack, installs the right packages, writes an edge-safe `instrumentation.ts`, and creates the database schema. Plus `init`, `status`, `drop` for schema management.

[![npm](https://img.shields.io/npm/v/@apitrail/cli/alpha?color=a78bfa&label=npm)](https://www.npmjs.com/package/@apitrail/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The flagship command

```bash
pnpm dlx @apitrail/cli install
```

Walks your project through:

1. 🔎 Detect the package manager (pnpm / npm / yarn / bun), Next.js version, TypeScript
2. 📄 Read `DATABASE_URL` from `.env.local` / `.env`, or prompt
3. 🧠 Scan `package.json` for `pg` / `drizzle-orm` / `ioredis` / `mongoose` / `aws-sdk` / etc. and **offer matching OTEL instrumentations** for automatic query timings
4. 📦 Install `apitrail` + `@apitrail/postgres` + `pg` (+ optional `@apitrail/dashboard` + chosen OTEL instrumentations)
5. ✍️ Write an **edge-safe** `instrumentation.ts` (backing up any existing one)
6. 🔐 Append `DATABASE_URL` to `.env.local` if missing
7. 🗄️ Create the `apitrail_spans` table in your database
8. (optional) 🖼️ Scaffold `app/apitrail/[[...path]]/page.tsx` for the embedded dashboard

```bash
# non-interactive, CI-safe
DATABASE_URL="postgres://…" pnpm dlx @apitrail/cli install --yes --with-dashboard
```

### Flags

| Flag | Effect |
|---|---|
| `--yes` | Accept defaults, no prompts |
| `--with-dashboard` | Scaffold the embedded dashboard route |
| `--db <url>` | Override the connection string |
| `--table <name>` | Custom table name |
| `--no-install` | Skip running the package manager |
| `--no-migrate` | Skip `CREATE TABLE` |

## Other commands

### `apitrail init`

Creates only the `apitrail_spans` table and its indexes. Use this when you don't need the full wizard (already set up, just need the schema):

```bash
# uses APITRAIL_DATABASE_URL / DATABASE_URL / POSTGRES_URL
apitrail init

# explicit URL
apitrail init --url "postgres://…"

# custom table name
apitrail init --table my_api_logs

# drop + recreate (destructive)
apitrail init --force

# print SQL only — paste it into Supabase's SQL editor, etc.
apitrail init --print
```

### `apitrail status`

Live stats straight from your DB:

```bash
apitrail status
apitrail status --limit 20
```

```
apitrail status
─────────────────────────────────────────────
table       : apitrail_spans
total rows  : 15 432
last 24h    : 1 240
errors 24h  : 3
slow 24h    : 12  (>500ms)
spans/kind  : SERVER=3892, INTERNAL=11540

recent 10 requests:
─────────────────────────────────────────────
14:32:01  a1b2c3d4  GET   /api/users        200     45ms
14:32:00  e5f6a7b8  POST  /api/leads        201    132ms
14:31:55  c9d0e1f2  GET   /api/boom         500     67ms ⚠ intentional boom
```

### `apitrail drop`

Drops the table (destructive, requires `--yes`):

```bash
apitrail drop --yes
apitrail drop --yes --table my_api_logs
```

## Install globally (optional)

```bash
pnpm add -g @apitrail/cli
apitrail install
apitrail status --limit 10
```

Or skip the global install and just use `pnpm dlx @apitrail/cli@alpha <cmd>` / `npx @apitrail/cli@alpha <cmd>` for any one-off.

## Environment

| Variable | Purpose |
|---|---|
| `APITRAIL_DATABASE_URL` | Connection string (preferred over `DATABASE_URL`) |
| `DATABASE_URL` | Fallback |
| `POSTGRES_URL` | Fallback |
| `NO_COLOR=1` | Disable colored output |
| `APITRAIL_DEBUG=1` | Print stack traces on error |

## What the wizard writes

Your generated `instrumentation.ts` looks like this — all dynamic-imported, edge-safe:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { DEFAULT_MASK_KEYS, defineConfig, register: apitrailRegister } = await import('@apitrail/core')
  const { postgresAdapter } = await import('@apitrail/postgres')

  await apitrailRegister(
    defineConfig({
      adapter: postgresAdapter({
        connectionString: process.env.DATABASE_URL,
        poolConfig: {
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        },
      }),
      skipPaths: [/^\/_next\//, /^\/favicon\./, '/api/health'],
      maskKeys: [...DEFAULT_MASK_KEYS],
      sampling: { success: 1, error: 1, slow: 1 },
    }),
  )
}
```

If you opted in to any OTEL instrumentation (e.g. `@opentelemetry/instrumentation-pg`), apitrail's `autoInstrument: true` default picks it up at startup — no edit needed here.

## License

MIT — [full repo](https://github.com/osharim/apitrail)
