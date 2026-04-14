import { createHash, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

/**
 * Very small HTTP Basic Auth middleware. Uses timing-safe equality on SHA-256
 * hashes of the `user:pass` pair so the comparison time doesn't leak the
 * password length or content.
 */
export function basicAuth(expected: string): MiddlewareHandler {
  const expectedHash = sha256(expected)
  return async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    if (!header.toLowerCase().startsWith('basic ')) {
      return unauthorized(c)
    }
    const encoded = header.slice(6).trim()
    let decoded: string
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8')
    } catch {
      return unauthorized(c)
    }
    if (!safeEqual(sha256(decoded), expectedHash)) {
      return unauthorized(c)
    }
    await next()
  }
}

function unauthorized(c: Parameters<MiddlewareHandler>[0]): Response {
  c.header('WWW-Authenticate', 'Basic realm="apitrail studio", charset="UTF-8"')
  return c.text('Unauthorized', 401)
}

function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest()
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
