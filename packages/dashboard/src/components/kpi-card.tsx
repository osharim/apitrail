import type { ReactElement, ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'ok' | 'warn' | 'error'
}

export function KpiCard({ label, value, sub, tone }: Props): ReactElement {
  return (
    <div className="at-card">
      <div className="at-card-label">{label}</div>
      <div className={`at-card-value ${tone ?? ''}`}>{value}</div>
      {sub ? <div className="at-card-sub">{sub}</div> : null}
    </div>
  )
}
