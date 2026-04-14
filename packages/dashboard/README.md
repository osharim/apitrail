# @apitrail/dashboard

> **Embed** a production-ready API-logs dashboard directly into your Next.js app. Drop-in Server Component with KPIs, request explorer, and a waterfall detail view. One route mount, auth-callback ready, ships its own CSS.

[![npm](https://img.shields.io/npm/v/@apitrail/dashboard/alpha?color=a78bfa&label=npm)](https://www.npmjs.com/package/@apitrail/dashboard)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Use this when you want the dashboard **inside** your own Next.js app (behind your existing auth, on your own domain, in prod). If you want a **standalone** dashboard for dev/ops — no embedding — use [`@apitrail/studio`](https://www.npmjs.com/package/@apitrail/studio) instead.

## Install

```bash
pnpm add @apitrail/dashboard pg server-only
```

Or, let the wizard install + scaffold in one go:

```bash
pnpm dlx apitrail install --with-dashboard
```

## Usage

Add a catch-all route:

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
  return <Dashboard params={params} />
}
```

Visit `/apitrail`. Done.

## Options

```tsx
<Dashboard
  params={params}
  basePath="/apitrail"                      // default
  connectionString={process.env.DATABASE_URL}
  tableName="apitrail_spans"                // default
  poolConfig={{ ssl: { rejectUnauthorized: false } }}   // Supabase
  auth={async () => {
    const session = await getSession()
    return session?.user?.role === 'admin'
  }}
/>
```

### Behind auth (recommended for production)

```tsx
import { Dashboard } from '@apitrail/dashboard'
import '@apitrail/dashboard/styles.css'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') redirect('/login')

  return (
    <Dashboard
      params={params}
      auth={async () => (await getCurrentUser())?.role === 'admin'}
    />
  )
}
```

The `auth` callback is a last-resort guard — pair it with a middleware or layout check so the Server Component never queries your DB for unauthorised visitors.

## Views

| View | Contents |
|---|---|
| **Overview** | Requests 24h, errors 24h, slow 24h (>500 ms), p50, p95 — queried on each request (no client polling) |
| **Recent requests** | Sortable table with method / path / status / duration / trace id — color-coded |
| **Request detail** | Meta (trace_id, span_id, route, runtime, host, client_ip, UA, referer, started), Chrome-DevTools-style waterfall of child spans, Request / Response headers + bodies — already redacted per `maskKeys` on the write side |

## Implementation notes

- **Pure Server Components.** Zero JavaScript shipped for navigation or rendering. Drawers are plain `<a>` links to the trace ID route.
- **Pooled pg connections.** One pool per unique `connectionString` + `poolConfig` is cached across requests.
- **`server-only` guard.** Queries live behind `import 'server-only'` so leaking them into a client bundle triggers a build error.
- **Scoped CSS.** All classes are `.at-*` prefixed — won't collide with your Tailwind / shadcn / etc.

## Studio or Dashboard?

| Use case | Pick |
|---|---|
| Dev / ops monitoring on your laptop | `@apitrail/studio` |
| Shared team dev server | `@apitrail/studio --host 0.0.0.0 --auth-basic …` |
| Inside your production app, behind your auth | `@apitrail/dashboard` (this package) |
| Full filters, click-through interactivity, live tail (planned) | `@apitrail/studio` |

## License

MIT — [full repo](https://github.com/osharim/apitrail)
