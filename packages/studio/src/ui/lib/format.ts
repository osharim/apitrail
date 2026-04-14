export function fmtDuration(ms: number | string | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  const n = typeof ms === 'string' ? Number(ms) : ms
  if (!Number.isFinite(n)) return '—'
  if (n < 1) return `${(n * 1000).toFixed(0)}µs`
  if (n < 1000) return `${n.toFixed(0)}ms`
  return `${(n / 1000).toFixed(2)}s`
}

export function fmtNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '0'
  const v = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(v)) return '0'
  return new Intl.NumberFormat('en-US').format(v)
}

export function fmtTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toISOString().slice(11, 19)
}

export function fmtRelative(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diffMs = Date.now() - date.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export function statusTone(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'text-neutral-500'
  if (code >= 500) return 'text-rose-400'
  if (code >= 400) return 'text-amber-400'
  if (code >= 300) return 'text-sky-400'
  if (code >= 200) return 'text-emerald-400'
  return 'text-neutral-500'
}

export function statusBg(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'bg-neutral-800 text-neutral-400'
  if (code >= 500) return 'bg-rose-950/70 text-rose-300 border border-rose-900/50'
  if (code >= 400) return 'bg-amber-950/70 text-amber-300 border border-amber-900/50'
  if (code >= 300) return 'bg-sky-950/70 text-sky-300 border border-sky-900/50'
  if (code >= 200) return 'bg-emerald-950/70 text-emerald-300 border border-emerald-900/50'
  return 'bg-neutral-800 text-neutral-400'
}

export function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-emerald-950/70 text-emerald-300 border border-emerald-900/50'
    case 'POST':
      return 'bg-sky-950/70 text-sky-300 border border-sky-900/50'
    case 'PUT':
      return 'bg-amber-950/70 text-amber-300 border border-amber-900/50'
    case 'PATCH':
      return 'bg-violet-950/70 text-violet-300 border border-violet-900/50'
    case 'DELETE':
      return 'bg-rose-950/70 text-rose-300 border border-rose-900/50'
    default:
      return 'bg-neutral-800 text-neutral-300 border border-neutral-700'
  }
}

export function durationTone(ms: number): string {
  if (ms > 1000) return 'text-rose-400'
  if (ms > 500) return 'text-amber-400'
  return 'text-neutral-400'
}

export function prettyJson(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
