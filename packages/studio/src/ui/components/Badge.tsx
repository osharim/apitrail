import { methodColor, statusBg } from '../lib/format'

export function StatusBadge({ code }: { code: number | null | undefined }) {
  return (
    <span
      className={`inline-flex min-w-[40px] justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular ${statusBg(code)}`}
    >
      {code ?? '—'}
    </span>
  )
}

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex min-w-[52px] justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${methodColor(method)}`}
    >
      {method}
    </span>
  )
}
