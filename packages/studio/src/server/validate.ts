const TRACE_ID_RE = /^[0-9a-f]{32}$/i
const METHOD_RE = /^[A-Z]{3,10}$/
const PATH_LIKE_MAX = 200

/** Strict integer parse. Returns undefined for non-integer / out-of-range input. */
export function parseInt32(
  raw: string | undefined,
  { min, max }: { min: number; max: number },
): number | undefined {
  if (raw === undefined || raw === '') return undefined
  // Reject strings with non-digit characters (handles "10abc", "1e9", "0x10").
  if (!/^-?\d+$/.test(raw)) return undefined
  const n = Number(raw)
  if (!Number.isInteger(n)) return undefined
  if (n < min || n > max) return undefined
  return n
}

export function isValidTraceId(id: string): boolean {
  return TRACE_ID_RE.test(id)
}

export function parseMethod(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const m = raw.toUpperCase()
  return METHOD_RE.test(m) ? m : undefined
}

export function parsePathLike(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  if (raw.length > PATH_LIKE_MAX) return undefined
  // Reject NULs and control characters that have no legitimate use in a path.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: filtering out control chars is the point of the rule here
  if (/[\x00-\x1f\x7f]/.test(raw)) return undefined
  return raw
}
