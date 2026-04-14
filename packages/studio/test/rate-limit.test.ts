import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRateLimiter } from '../src/server/rate-limit.js'

describe('rate limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to `max` requests within window', () => {
    const limit = createRateLimiter({ max: 3, windowMs: 60_000 })
    expect(limit('a')).toBe(true)
    expect(limit('a')).toBe(true)
    expect(limit('a')).toBe(true)
    expect(limit('a')).toBe(false)
  })

  it('isolates keys', () => {
    const limit = createRateLimiter({ max: 1, windowMs: 60_000 })
    expect(limit('a')).toBe(true)
    expect(limit('b')).toBe(true)
    expect(limit('a')).toBe(false)
    expect(limit('b')).toBe(false)
  })

  it('resets after window', () => {
    const limit = createRateLimiter({ max: 1, windowMs: 1000 })
    expect(limit('a')).toBe(true)
    expect(limit('a')).toBe(false)
    vi.advanceTimersByTime(1100)
    expect(limit('a')).toBe(true)
  })
})
