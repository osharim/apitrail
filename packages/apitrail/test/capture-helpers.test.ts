import { describe, expect, it } from 'vitest'
import { stringifyBodyRef } from '../src/capture.js'

describe('stringifyBodyRef (deferred stringify)', () => {
  it('stringifies JSON objects', () => {
    const out = stringifyBodyRef({ a: 1, b: 'c' }, 1000)
    expect(out).toBe('{"a":1,"b":"c"}')
  })

  it('returns strings as-is', () => {
    expect(stringifyBodyRef('hello', 1000)).toBe('hello')
  })

  it('truncates at maxBytes', () => {
    const out = stringifyBodyRef('abcdefghij', 5)
    expect(out).toMatch(/^abcde…\[truncated 5 chars\]$/)
  })

  it('handles null / undefined', () => {
    expect(stringifyBodyRef(null, 1000)).toBeUndefined()
    expect(stringifyBodyRef(undefined, 1000)).toBeUndefined()
  })

  it('decodes Uint8Array as UTF-8', () => {
    const bytes = new TextEncoder().encode('{"x":1}')
    expect(stringifyBodyRef(bytes, 1000)).toBe('{"x":1}')
  })

  it('marks streams without consuming them', () => {
    const stream = new ReadableStream()
    expect(stringifyBodyRef(stream, 1000)).toBe('[stream]')
  })

  it('marks blobs with size and type', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    expect(stringifyBodyRef(blob, 1000)).toMatch(/^\[blob 5B type=text\/plain\]$/)
  })

  it('serializes FormData', () => {
    const fd = new FormData()
    fd.set('name', 'Ada')
    fd.set('role', 'admin')
    expect(stringifyBodyRef(fd, 1000)).toBe('{"name":"Ada","role":"admin"}')
  })

  it('serializes URLSearchParams', () => {
    const sp = new URLSearchParams({ q: 'hello', page: '2' })
    expect(stringifyBodyRef(sp, 1000)).toBe('q=hello&page=2')
  })

  it('never-throws fallback for circular objects', () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    expect(stringifyBodyRef(circular, 1000)).toBeUndefined()
  })
})
