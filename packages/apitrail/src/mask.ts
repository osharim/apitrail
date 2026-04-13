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
 * Recursively mask values in a JSON object when the key matches one of the
 * configured keys (case-insensitive). Non-object values are returned as-is.
 */
export function maskObject<T>(value: T, keys: readonly string[]): T {
  const set = new Set(keys.map((k) => k.toLowerCase()))
  return walk(value, set) as T
}

function walk(value: unknown, keys: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => walk(v, keys))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = keys.has(k.toLowerCase()) ? MASKED_VALUE : walk(v, keys)
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
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = set.has(k.toLowerCase()) ? MASKED_VALUE : v
  }
  return out
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
