# @apitrail/cli

> CLI for [apitrail](https://apitrail.io) — init schema, inspect activity, drop.

## Install

```bash
# global
npm install -g @apitrail/cli

# or one-off (recommended)
npx @apitrail/cli init
```

## Commands

### `apitrail init`

Creates the `apitrail_spans` table and its indexes.

```bash
# Zero config (uses APITRAIL_DATABASE_URL / DATABASE_URL)
apitrail init

# Explicit URL
apitrail init --url "postgres://..."

# Custom table name
apitrail init --table my_api_logs

# Drop + recreate (destructive)
apitrail init --force

# Print SQL only (don't execute)
apitrail init --print
```

### `apitrail status`

Shows recent activity and stats.

```bash
apitrail status
apitrail status --limit 20
```

```
apitrail status
─────────────────────────────────────────────
table       : apitrail_spans
total rows  : 15432
last 24h    : 1240
errors 24h  : 3
slow 24h    : 12 (>500ms)
spans/kind  : SERVER=3892, INTERNAL=11540

recent 10 requests:
─────────────────────────────────────────────
14:32:01  a1b2c3d4  GET   /api/users        200     45ms
14:32:00  e5f6a7b8  POST  /api/leads        201    132ms
14:31:55  c9d0e1f2  GET   /api/boom         500     67ms ⚠ intentional boom
```

### `apitrail drop`

Drops the table (destructive, requires `--yes`).

```bash
apitrail drop --yes
apitrail drop --yes --table my_api_logs
```

## Environment

| Variable | Purpose |
|---|---|
| `APITRAIL_DATABASE_URL` | Connection string (preferred) |
| `DATABASE_URL` | Fallback |
| `POSTGRES_URL` | Fallback |
| `NO_COLOR=1` | Disable colored output |
| `APITRAIL_DEBUG=1` | Print stack traces on error |

## License

MIT
