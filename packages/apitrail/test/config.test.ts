import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, resolveConfig, shouldSkipPath } from '../src/config.js'

describe('resolveConfig', () => {
  it('applies defaults when nothing is passed', () => {
    const cfg = resolveConfig()
    expect(cfg.serviceName).toBe(DEFAULT_CONFIG.serviceName)
    expect(cfg.adapter.name).toBe('console')
    expect(cfg.batch.maxSize).toBe(50)
  })

  it('merges batch partial config', () => {
    const cfg = resolveConfig({ batch: { maxSize: 10 } })
    expect(cfg.batch.maxSize).toBe(10)
    expect(cfg.batch.intervalMs).toBe(DEFAULT_CONFIG.batch.intervalMs)
  })

  it('overrides the adapter when provided', () => {
    const cfg = resolveConfig({
      adapter: { name: 'custom', insertBatch: () => {} },
    })
    expect(cfg.adapter.name).toBe('custom')
  })
})

describe('shouldSkipPath', () => {
  it('matches exact strings', () => {
    expect(shouldSkipPath('/api/health', ['/api/health'])).toBe(true)
    expect(shouldSkipPath('/api/users', ['/api/health'])).toBe(false)
  })

  it('matches string prefixes with slash', () => {
    expect(shouldSkipPath('/api/internal/ping', ['/api/internal'])).toBe(true)
  })

  it('matches regex rules', () => {
    expect(shouldSkipPath('/_next/static/chunk.js', [/^\/_next\//])).toBe(true)
    expect(shouldSkipPath('/api/users', [/^\/_next\//])).toBe(false)
  })
})
