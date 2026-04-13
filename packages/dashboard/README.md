# @apitrail/dashboard

> Embeddable Next.js dashboard for [apitrail](https://apitrail.io).

Ships a pre-built Server Component you drop into your Next.js app. Reads from the same database apitrail writes to. Dark-first, zero-JS by default (all RSC), one CSS import.

## Install

```bash
npm install @apitrail/dashboard
```

## Usage

Add a catch-all route:

```tsx
// app/apitrail/[[...path]]/page.tsx
import { Dashboard } from '@apitrail/dashboard'
import '@apitrail/dashboard/styles.css'

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
  poolConfig={{ ssl: { rejectUnauthorized: false } }}
  auth={async () => {
    const session = await getSession()
    return session?.user?.role === 'admin'
  }}
/>
```

## Features in v0.1

- **Overview** — KPI cards (requests 24h, errors, slow, p50, p95) + recent requests table
- **Request detail** — method/path/status/duration meta, full waterfall of child spans, request & response headers + body (already redacted by the core)
- **Server-only** — all queries run on the server, zero client JS shipped for navigation

## Pro tip

If you want the dashboard behind auth, pair `auth` with a middleware or layout that checks the session before this page renders. The `auth` callback is a final safety net, not your only defense.

## License

MIT
