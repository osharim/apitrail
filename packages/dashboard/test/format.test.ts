import { describe, expect, it } from 'vitest'
import { fmtDuration, fmtNumber, prettyJson, statusTone } from '../src/lib/format.js'

describe('fmtDuration', () => {
  it('formats microseconds', () => {
    expect(fmtDuration(0.5)).toBe('500µs')
  })
  it('formats milliseconds', () => {
    expect(fmtDuration(42)).toBe('42ms')
  })
  it('formats seconds', () => {
    expect(fmtDuration(1234)).toBe('1.23s')
  })
  it('handles null / invalid input', () => {
    expect(fmtDuration(null)).toBe('—')
    expect(fmtDuration(undefined)).toBe('—')
    expect(fmtDuration('abc')).toBe('—')
  })
})

describe('fmtNumber', () => {
  it('adds thousands separators', () => {
    expect(fmtNumber(1000)).toBe('1,000')
    expect(fmtNumber(1234567)).toBe('1,234,567')
  })
  it('handles null/zero', () => {
    expect(fmtNumber(null)).toBe('0')
    expect(fmtNumber(0)).toBe('0')
  })
})

describe('statusTone', () => {
  it('classifies status codes', () => {
    expect(statusTone(200)).toBe('ok')
    expect(statusTone(301)).toBe('redirect')
    expect(statusTone(404)).toBe('warn')
    expect(statusTone(500)).toBe('error')
    expect(statusTone(null)).toBe('muted')
  })
})

describe('prettyJson', () => {
  it('pretty-prints valid JSON', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}')
  })
  it('returns input unchanged for invalid JSON', () => {
    expect(prettyJson('not-json')).toBe('not-json')
  })
  it('handles empty / null', () => {
    expect(prettyJson('')).toBe('')
    expect(prettyJson(null)).toBe('')
  })
})
