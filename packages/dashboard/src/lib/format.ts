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

export function fmtTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toISOString().slice(11, 19)
}

export function statusTone(
  status: number | null | undefined,
): 'ok' | 'redirect' | 'warn' | 'error' | 'muted' {
  if (status === null || status === undefined) return 'muted'
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  if (status >= 300) return 'redirect'
  if (status >= 200) return 'ok'
  return 'muted'
}

export function prettyJson(raw: string | null | undefined): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
