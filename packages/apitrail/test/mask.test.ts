import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MASK_KEYS,
  MASKED_VALUE,
  maskHeaders,
  maskJsonString,
  maskObject,
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
})

describe('maskJsonString', () => {
  it('parses and re-stringifies masked JSON', () => {
    const input = JSON.stringify({ password: 'hunter2', user: 'john' })
    const out = maskJsonString(input, ['password'])
    expect(JSON.parse(out!)).toEqual({ password: MASKED_VALUE, user: 'john' })
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
