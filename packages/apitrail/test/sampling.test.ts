import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { shouldSample } from '../src/sampling.js'
import type { SpanEntry } from '../src/types.js'

function makeEntry(over: Partial<SpanEntry> = {}): SpanEntry {
  return {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    name: 'GET /api/x',
    kind: 'SERVER',
    status: 'OK',
    startTime: Date.now(),
    durationMs: 50,
    runtime: 'nodejs',
    attributes: {},
    ...over,
  }
}

describe('shouldSample', () => {
  it('keeps everything with default config', () => {
    const cfg = resolveConfig()
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(makeEntry({ statusCode: 200 }), cfg)).toBe(true)
    }
  })

  it('honors sampling.error = 0', () => {
    const cfg = resolveConfig({ sampling: { error: 0 } })
    expect(shouldSample(makeEntry({ statusCode: 500 }), cfg)).toBe(false)
  })

  it('honors sampling.success = 0', () => {
    const cfg = resolveConfig({ sampling: { success: 0 } })
    expect(shouldSample(makeEntry({ statusCode: 200 }), cfg)).toBe(false)
    // errors still kept
    expect(shouldSample(makeEntry({ statusCode: 500 }), cfg)).toBe(true)
  })

  it('treats slow requests distinctly', () => {
    const cfg = resolveConfig({ slowMs: 100, sampling: { success: 0, slow: 1, error: 1 } })
    expect(shouldSample(makeEntry({ statusCode: 200, durationMs: 50 }), cfg)).toBe(false)
    expect(shouldSample(makeEntry({ statusCode: 200, durationMs: 500 }), cfg)).toBe(true)
  })

  it('applies global sampleRate to non-SERVER spans', () => {
    const cfg = resolveConfig({ sampleRate: 0 })
    expect(shouldSample(makeEntry({ kind: 'INTERNAL' }), cfg)).toBe(false)
  })

  it('keeps non-SERVER spans when sampleRate is 1 regardless of status', () => {
    const cfg = resolveConfig()
    expect(shouldSample(makeEntry({ kind: 'CLIENT', statusCode: 500 }), cfg)).toBe(true)
  })
})
