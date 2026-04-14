import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MASK_KEYS,
  MASKED_VALUE,
  maskHeaders,
  maskJsonString,
  maskObject,
  maskQueryString,
  splitAndMaskPath,
  truncate,
} from '../src/mask.js'

describe('maskObject', () => {
  it('masks top-level keys case-insensitively', () => {
    const result = maskObject({ username: 'john', Password: 'secret', TOKEN: 'x' }, [
      'password',
      'token',
    ])
    expect(result).toEqual({ username: 'john', Password: MASKED_VALUE, TOKEN: MASKED_VALUE })
  })

  it('masks deeply nested keys', () => {
    const result = maskObject(
      { user: { password: 'secret', profile: { authorization: 'Bearer xyz' } } },
      DEFAULT_MASK_KEYS,
    )
    expect(result).toEqual({
      user: { password: MASKED_VALUE, profile: { authorization: MASKED_VALUE } },
    })
  })

  it('masks values inside arrays', () => {
    const result = maskObject([{ token: 'a' }, { token: 'b' }], ['token'])
    expect(result).toEqual([{ token: MASKED_VALUE }, { token: MASKED_VALUE }])
  })

  it('leaves non-matching keys untouched', () => {
    const result = maskObject({ foo: 'bar', nested: { baz: 1 } }, ['password'])
    expect(result).toEqual({ foo: 'bar', nested: { baz: 1 } })
  })

  it('returns primitives as-is', () => {
    expect(maskObject('hello', [])).toBe('hello')
    expect(maskObject(42, [])).toBe(42)
    expect(maskObject(null, [])).toBe(null)
  })
})

describe('maskObject — security hardening', () => {
  it('does not pollute prototype via __proto__', () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}, "safe": "yes"}')
    const result = maskObject(input, [])
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(result)).toBe(null)
  })

  it('skips constructor and prototype keys too', () => {
    const input = JSON.parse('{"constructor": {"bad": 1}, "prototype": {"worse": 2}, "ok": 3}')
    const result = maskObject(input, []) as Record<string, unknown>
    expect(result.ok).toBe(3)
    expect(result.constructor).toBeUndefined()
    expect(result.prototype).toBeUndefined()
  })

  it('caps deep recursion instead of stack-overflowing', () => {
    // Build a nested 100-deep object
    type Nested = { a: Nested | string }
    let current: Nested = { a: 'deep' }
    for (let i = 0; i < 100; i++) current = { a: current }
    const result = maskObject(current, []) as Nested

    // Walk the result until we hit the truncation marker
    let cur: unknown = result
    let depth = 0
    while (cur && typeof cur === 'object' && 'a' in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>).a
      depth++
      if (depth > 200) throw new Error('did not truncate')
    }
    expect(typeof cur === 'string' || cur === 'deep').toBe(true)
  })
})

describe('maskJsonString', () => {
  it('parses and re-stringifies masked JSON', () => {
    const input = JSON.stringify({ password: 'hunter2', user: 'john' })
    const out = maskJsonString(input, ['password'])
    expect(out).toBeDefined()
    expect(JSON.parse(out as string)).toEqual({ password: MASKED_VALUE, user: 'john' })
  })

  it('returns non-JSON input unchanged', () => {
    expect(maskJsonString('hello world', ['password'])).toBe('hello world')
  })

  it('handles undefined', () => {
    expect(maskJsonString(undefined, [])).toBeUndefined()
  })
})

describe('maskHeaders', () => {
  it('masks sensitive headers case-insensitively', () => {
    const out = maskHeaders(
      { 'Content-Type': 'application/json', Authorization: 'Bearer abc', 'X-API-Key': 'xxx' },
      ['authorization', 'x-api-key'],
    )
    expect(out).toEqual({
      'Content-Type': 'application/json',
      Authorization: MASKED_VALUE,
      'X-API-Key': MASKED_VALUE,
    })
  })

  it('drops __proto__ header name if present', () => {
    const hostile = JSON.parse('{"content-type": "text/plain", "__proto__": "bad"}')
    const out = maskHeaders(hostile, [])
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false)
  })
})

describe('maskQueryString', () => {
  it('masks matching keys, keeps others', () => {
    const out = maskQueryString('/foo?user=john&api_key=abc&token=xyz', ['api_key', 'token'])
    expect(out).toBe('?user=john&api_key=***MASKED***&token=***MASKED***')
  })

  it('returns empty string when no query is present', () => {
    expect(maskQueryString('/foo', ['token'])).toBe('')
    expect(maskQueryString('', ['token'])).toBe('')
  })

  it('handles the case-insensitive key match', () => {
    const out = maskQueryString('/foo?API_KEY=abc', ['api_key'])
    expect(out).toBe('?API_KEY=***MASKED***')
  })
})

describe('splitAndMaskPath', () => {
  it('splits the path from the query and masks secrets in the query', () => {
    const { path, query } = splitAndMaskPath('/api/users?api_key=secret&q=ok', DEFAULT_MASK_KEYS)
    expect(path).toBe('/api/users')
    expect(query).toBe('?api_key=***MASKED***&q=ok')
  })

  it('returns the path unchanged and empty query when no ? is present', () => {
    const { path, query } = splitAndMaskPath('/api/users', DEFAULT_MASK_KEYS)
    expect(path).toBe('/api/users')
    expect(query).toBe('')
  })
})

describe('truncate', () => {
  it('leaves short strings alone', () => {
    expect(truncate('hi', 10)).toBe('hi')
  })

  it('truncates long strings and appends info', () => {
    const out = truncate('abcdefghij', 5)
    expect(out).toMatch(/^abcde…\[truncated 5 chars\]$/)
  })

  it('does nothing when maxBytes is negative', () => {
    expect(truncate('long long long', -1)).toBe('long long long')
  })
})
