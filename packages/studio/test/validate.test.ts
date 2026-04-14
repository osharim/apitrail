import { describe, expect, it } from 'vitest'
import { isValidTraceId, parseInt32, parseMethod, parsePathLike } from '../src/server/validate.js'

describe('parseInt32', () => {
  const opts = { min: 0, max: 100 }

  it('parses valid integers', () => {
    expect(parseInt32('42', opts)).toBe(42)
    expect(parseInt32('0', opts)).toBe(0)
    expect(parseInt32('100', opts)).toBe(100)
  })

  it('rejects non-integer strings', () => {
    expect(parseInt32('abc', opts)).toBeUndefined()
    expect(parseInt32('10abc', opts)).toBeUndefined()
    expect(parseInt32('1.5', opts)).toBeUndefined()
    expect(parseInt32('1e9', opts)).toBeUndefined()
    expect(parseInt32('0x10', opts)).toBeUndefined()
    expect(parseInt32('', opts)).toBeUndefined()
  })

  it('rejects values outside range', () => {
    expect(parseInt32('-1', opts)).toBeUndefined()
    expect(parseInt32('101', opts)).toBeUndefined()
  })

  it('does not crash on undefined', () => {
    expect(parseInt32(undefined, opts)).toBeUndefined()
  })
})

describe('isValidTraceId', () => {
  it('accepts 32-char hex', () => {
    expect(isValidTraceId('0123456789abcdef0123456789abcdef')).toBe(true)
    expect(isValidTraceId('ABCDEF0123456789ABCDEF0123456789')).toBe(true)
  })

  it('rejects non-hex or wrong length', () => {
    expect(isValidTraceId('short')).toBe(false)
    expect(isValidTraceId('g0123456789abcdef0123456789abcdef')).toBe(false)
    expect(isValidTraceId('0123456789abcdef0123456789abcdefAA')).toBe(false)
    expect(isValidTraceId("foo'; DROP TABLE apitrail_spans;--")).toBe(false)
  })
})

describe('parseMethod', () => {
  it('accepts standard HTTP methods', () => {
    expect(parseMethod('GET')).toBe('GET')
    expect(parseMethod('post')).toBe('POST')
    expect(parseMethod('DELETE')).toBe('DELETE')
  })

  it('rejects injection attempts', () => {
    expect(parseMethod('GET; DROP TABLE')).toBeUndefined()
    expect(parseMethod("GET'OR'1'='1")).toBeUndefined()
    expect(parseMethod('')).toBeUndefined()
  })
})

describe('parsePathLike', () => {
  it('accepts normal path substrings', () => {
    expect(parsePathLike('/api/users')).toBe('/api/users')
    expect(parsePathLike('stripe')).toBe('stripe')
  })

  it('rejects over-long inputs', () => {
    expect(parsePathLike('a'.repeat(201))).toBeUndefined()
  })

  it('rejects control characters', () => {
    expect(parsePathLike('foo\x00bar')).toBeUndefined()
    expect(parsePathLike('foo\nbar')).toBeUndefined()
  })

  it('accepts empty/undefined as undefined', () => {
    expect(parsePathLike(undefined)).toBeUndefined()
    expect(parsePathLike('')).toBeUndefined()
  })
})
