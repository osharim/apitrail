import type { ReactElement } from 'react'
import { Detail } from './detail.js'
import { Overview } from './overview.js'
import type { DashboardProps } from './types.js'

export type { DashboardProps } from './types.js'

const TRACE_ID_RE = /^[0-9a-f]{32}$/i

/**
 * The apitrail dashboard as a Next.js-ready Server Component.
 *
 * Mount it at any path via a catch-all route:
 *
 * ```tsx
 * // app/apitrail/[[...path]]/page.tsx
 * import { Dashboard } from '@apitrail/dashboard'
 * import '@apitrail/dashboard/styles.css'
 *
 * export default async function Page({
 *   params,
 * }: {
 *   params: Promise<{ path?: string[] }>
 * }) {
 *   return <Dashboard params={params} />
 * }
 * ```
 */
export async function Dashboard(props: DashboardProps): Promise<ReactElement> {
  if (props.auth) {
    const allowed = await props.auth()
    if (!allowed) {
      return (
        <html lang="en">
          <body className="at-app">
            <div className="at-container">
              <div className="at-card at-empty">Not authorized.</div>
            </div>
          </body>
        </html>
      )
    }
  }

  const resolvedParams = (await props.params) ?? {}
  const path = resolvedParams.path ?? []
  const basePath = props.basePath ?? '/apitrail'

  const [first] = path
  const isTrace = first && TRACE_ID_RE.test(first)

  const body = isTrace ? (
    <Detail {...props} traceId={first} basePath={basePath} />
  ) : (
    <Overview {...props} basePath={basePath} />
  )

  return (
    <div className="at-app">
      <header className="at-header">
        <div className="at-brand">
          <span className="at-brand-dot" />
          <a href={basePath} style={{ color: 'inherit', textDecoration: 'none' }}>
            apitrail
          </a>
        </div>
        <div className="at-breadcrumb">
          {isTrace ? (
            <>
              <a href={basePath}>overview</a>
              <span className="at-dim"> / </span>
              <span className="at-mono">{first.slice(0, 8)}</span>
            </>
          ) : (
            <span>overview</span>
          )}
        </div>
      </header>
      <main className="at-container">{body}</main>
    </div>
  )
}

export default Dashboard
