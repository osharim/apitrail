export const DEFAULT_MASK_KEYS: readonly string[] = [
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'secret',
  'client_secret',
  'authorization',
  'auth',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'credit_card',
  'creditcard',
  'card_number',
  'cvv',
  'ssn',
]

export const MASKED_VALUE = '***MASKED***'

/**
 * Keys that must never be written onto an object during masking — even if the
 * attacker manages to land one as a JSON key, writing it via `obj[k]` would
 * modify the prototype chain of the output object (prototype pollution).
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Guard against malicious payloads trying to DoS the masker via deep nesting. */
const MAX_MASK_DEPTH = 32

/**
 * Recursively mask values in a JSON object when the key matches one of the
 * configured keys (case-insensitive). Non-object values are returned as-is.
 *
 * Hardening:
 *  - Skips `__proto__` / `constructor` / `prototype` keys to prevent
 *    prototype pollution if the input is untrusted.
 *  - Caps recursion at MAX_MASK_DEPTH — deeper values are replaced with a
 *    placeholder string rather than triggering stack overflow.
 *  - Uses `Object.create(null)` for the output container so the returned
 *    value has no inherited methods or properties.
 */
export function maskObject<T>(value: T, keys: readonly string[]): T {
  const lower = new Set(keys.map((k) => k.toLowerCase()))
  return walk(value, lower, 0) as T
}

function walk(value: unknown, keys: Set<string>, depth: number): unknown {
  if (depth > MAX_MASK_DEPTH) return '[nested too deep]'

  if (Array.isArray(value)) return value.map((v) => walk(v, keys, depth + 1))

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = Object.create(null)
    for (const k of Object.keys(value as object)) {
      if (DANGEROUS_KEYS.has(k)) continue
      const child = (value as Record<string, unknown>)[k]
      out[k] = keys.has(k.toLowerCase()) ? MASKED_VALUE : walk(child, keys, depth + 1)
    }
    return out
  }

  return value
}

/**
 * Mask a JSON-encoded string body. If the body is not valid JSON, it is
 * returned unchanged. If an empty/undefined body is given, returns it as-is.
 */
export function maskJsonString(
  body: string | undefined,
  keys: readonly string[],
): string | undefined {
  if (!body) return body
  try {
    const parsed = JSON.parse(body)
    return JSON.stringify(maskObject(parsed, keys))
  } catch {
    return body
  }
}

/**
 * Mask header values where the header name matches one of the configured keys
 * (case-insensitive).
 */
export function maskHeaders(
  headers: Record<string, string>,
  keys: readonly string[],
): Record<string, string> {
  const set = new Set(keys.map((k) => k.toLowerCase()))
  const out: Record<string, string> = Object.create(null)
  for (const [k, v] of Object.entries(headers)) {
    if (DANGEROUS_KEYS.has(k)) continue
    out[k] = set.has(k.toLowerCase()) ? MASKED_VALUE : v
  }
  return out
}

/**
 * Mask a URL query string. Keys matching `maskKeys` (case-insensitive) get
 * their value replaced with `***MASKED***`. Returns the query portion
 * including the leading `?`, or an empty string if the input had none.
 */
export function maskQueryString(queryOrUrl: string, keys: readonly string[]): string {
  const q = queryOrUrl.indexOf('?')
  if (q === -1) return ''
  const rawQuery = queryOrUrl.slice(q + 1)
  if (rawQuery === '') return '?'

  const set = new Set(keys.map((k) => k.toLowerCase()))
  let searchParams: URLSearchParams
  try {
    searchParams = new URLSearchParams(rawQuery)
  } catch {
    return `?${rawQuery}`
  }

  const out = new URLSearchParams()
  for (const [k, v] of searchParams) {
    out.append(k, set.has(k.toLowerCase()) ? MASKED_VALUE : v)
  }
  const serialised = out.toString()
  return serialised === '' ? '?' : `?${serialised}`
}

/**
 * Split a URL or path into (path, maskedQuery) so the path portion never
 * carries secrets passed via query string (e.g. `?api_key=…`).
 */
export function splitAndMaskPath(
  urlOrPath: string,
  keys: readonly string[],
): { path: string; query: string } {
  const q = urlOrPath.indexOf('?')
  if (q === -1) return { path: urlOrPath, query: '' }
  return {
    path: urlOrPath.slice(0, q),
    query: maskQueryString(urlOrPath, keys),
  }
}

/**
 * Truncate a string body if it exceeds maxBytes. Truncation is UTF-16
 * code-unit-based (JS string length) for simplicity — an approximation of
 * bytes that is fast and safe for logs.
 */
export function truncate(body: string | undefined, maxBytes: number): string | undefined {
  if (body === undefined || body === null) return body
  if (maxBytes < 0) return body
  if (body.length <= maxBytes) return body
  return `${body.slice(0, maxBytes)}…[truncated ${body.length - maxBytes} chars]`
}
