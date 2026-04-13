import type { ReactElement } from 'react'
import { statusTone } from '../lib/format.js'

export function StatusBadge({ code }: { code: number | null | undefined }): ReactElement {
  const tone = statusTone(code)
  return <span className={`at-status ${tone}`}>{code ?? '—'}</span>
}

export function MethodBadge({ method }: { method: string }): ReactElement {
  return <span className={`at-method ${method}`}>{method}</span>
}

export function DurationCell({ ms }: { ms: number }): ReactElement {
  const cls = ms > 1000 ? 'very-slow' : ms > 500 ? 'slow' : ''
  const text = ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`
  return <span className={`at-duration ${cls}`}>{text}</span>
}
