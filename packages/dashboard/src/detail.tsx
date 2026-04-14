import type { ReactElement } from 'react'
import { MethodBadge, StatusBadge } from './components/status-badge.js'
import { Waterfall } from './components/waterfall.js'
import { fmtDuration, prettyJson } from './lib/format.js'
import { getRequestDetail } from './queries.js'
import type { DashboardProps } from './types.js'

export async function Detail(props: DashboardProps & { traceId: string }): Promise<ReactElement> {
  const { root, children } = await getRequestDetail(props, props.traceId)
  const basePath = props.basePath ?? '/apitrail'

  if (!root) {
    return (
      <div className="at-card at-empty">
        No request found for trace <code className="at-mono">{props.traceId}</code>.
        <div style={{ marginTop: 12 }}>
          <a href={basePath} className="at-btn">
            ← back
          </a>
        </div>
      </div>
    )
  }

  const reqHeaders = root.req_headers ?? {}
  const resHeaders = root.res_headers ?? {}

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <a href={basePath} className="at-btn">
          ← overview
        </a>
      </div>

      {root.error_message ? (
        <div className="at-error-box">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{root.error_message}</div>
          {root.error_stack ? (
            <pre
              className="at-code"
              style={{ marginTop: 8, background: 'transparent', border: 'none', padding: 0 }}
            >
              {root.error_stack}
            </pre>
          ) : null}
        </div>
      ) : null}

      <section className="at-section">
        <div className="at-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <MethodBadge method={root.method} />
            <span className="at-mono" style={{ fontSize: 16, fontWeight: 500 }}>
              {root.path}
            </span>
            <StatusBadge code={root.status_code} />
            <span className="at-dim at-mono">{fmtDuration(Number(root.duration_ms))}</span>
          </div>
          <dl className="at-detail-meta">
            <dt>trace_id</dt>
            <dd>{root.trace_id}</dd>
            <dt>span_id</dt>
            <dd>{root.span_id}</dd>
            <dt>route</dt>
            <dd>{root.route ?? '—'}</dd>
            <dt>runtime</dt>
            <dd>{root.runtime}</dd>
            <dt>host</dt>
            <dd>{root.host ?? '—'}</dd>
            <dt>client_ip</dt>
            <dd>{root.client_ip ?? '—'}</dd>
            <dt>user_agent</dt>
            <dd>{root.user_agent ?? '—'}</dd>
            <dt>referer</dt>
            <dd>{root.referer ?? '—'}</dd>
            <dt>started</dt>
            <dd>{new Date(root.start_time).toISOString()}</dd>
          </dl>
        </div>
      </section>

      <section className="at-section">
        <h2 className="at-section-title">Waterfall · {children.length} child span(s)</h2>
        <div className="at-card">
          <Waterfall
            rootStart={new Date(root.start_time)}
            rootDuration={Number(root.duration_ms)}
            spans={children}
          />
        </div>
      </section>

      <section className="at-section">
        <h2 className="at-section-title">Request</h2>
        <div className="at-detail-grid">
          <div>
            <div className="at-card-label" style={{ marginBottom: 8 }}>
              headers
            </div>
            <pre className="at-code">{prettyJson(JSON.stringify(reqHeaders))}</pre>
          </div>
          <div>
            <div className="at-card-label" style={{ marginBottom: 8 }}>
              body
            </div>
            <pre className="at-code">
              {prettyJson(root.req_body) || <span className="at-dim">(empty)</span>}
            </pre>
          </div>
        </div>
      </section>

      <section className="at-section">
        <h2 className="at-section-title">Response</h2>
        <div className="at-detail-grid">
          <div>
            <div className="at-card-label" style={{ marginBottom: 8 }}>
              headers
            </div>
            <pre className="at-code">{prettyJson(JSON.stringify(resHeaders))}</pre>
          </div>
          <div>
            <div className="at-card-label" style={{ marginBottom: 8 }}>
              body
            </div>
            <pre className="at-code">
              {prettyJson(root.res_body) || <span className="at-dim">(empty)</span>}
            </pre>
          </div>
        </div>
      </section>
    </>
  )
}
