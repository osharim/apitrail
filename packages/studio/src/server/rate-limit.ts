/**
 * Tiny in-memory rate limiter for local-dev use. Keyed by client address,
 * resets every window. NOT a production rate limiter — if you expose studio
 * on the internet, put a real proxy in front.
 */
export function createRateLimiter(opts: { max: number; windowMs: number }): (
  key: string,
) => boolean {
  const buckets = new Map<string, { count: number; resetAt: number }>()

  const sweep = (now: number): void => {
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k)
    }
  }

  return (key: string): boolean => {
    const now = Date.now()
    // Opportunistic cleanup — keeps map from growing unbounded in a long session.
    if (buckets.size > 1024) sweep(now)

    const existing = buckets.get(key)
    if (!existing || existing.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs })
      return true
    }

    if (existing.count >= opts.max) return false
    existing.count++
    return true
  }
}
