import type { ReactNode } from 'react'

interface Props {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'error'
}

const TONE_CLS: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-neutral-100',
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-rose-400',
}

export function KpiCard({ label, value, sub, tone = 'default' }: Props) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight tabular ${TONE_CLS[tone]}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-neutral-500 tabular">{sub}</div> : null}
    </div>
  )
}
