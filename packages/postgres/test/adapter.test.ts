import type { SpanEntry } from 'apitrail'
import { describe, expect, it, vi } from 'vitest'
import { postgresAdapter } from '../src/index.js'

function makeEntry(overrides: Partial<SpanEntry> = {}): SpanEntry {
  return {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    name: 'GET /api/x',
    kind: 'SERVER',
    status: 'OK',
    startTime: 1_700_000_000_000,
    method: 'GET',
    path: '/api/x',
    durationMs: 42,
    runtime: 'nodejs',
    attributes: {},
    ...overrides,
  }
}

function mockPool() {
  const queries: { sql: string; params?: unknown[] }[] = []
  return {
    queries,
    pool: {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })
        return { rows: [], rowCount: params ? params.length / 16 : 0 }
      }),
      end: vi.fn(async () => {}),
    },
  }
}

describe('postgresAdapter', () => {
  it('inserts a single entry with the right placeholders', async () => {
    const { pool, queries } = mockPool()
    const adapter = postgresAdapter({
      // biome-ignore lint/suspicious/noExplicitAny: mock
      pool: pool as any,
    })

    await adapter.insertBatch([makeEntry()])

    expect(queries).toHaveLength(1)
    expect(queries[0]?.sql).toContain('INSERT INTO "apitrail_spans"')
    // 25 columns now
    expect(queries[0]?.params).toHaveLength(25)
  })

  it('batches multiple entries into one statement', async () => {
    const { pool, queries } = mockPool()
    const adapter = postgresAdapter({
      // biome-ignore lint/suspicious/noExplicitAny: mock
      pool: pool as any,
    })

    await adapter.insertBatch([makeEntry(), makeEntry(), makeEntry()])

    expect(queries).toHaveLength(1)
    expect(queries[0]?.sql).toMatch(/VALUES \(.+\), \(.+\), \(.+\)/s)
    expect(queries[0]?.params).toHaveLength(75)
  })

  it('no-ops on empty batch', async () => {
    const { pool, queries } = mockPool()
    const adapter = postgresAdapter({
      // biome-ignore lint/suspicious/noExplicitAny: mock
      pool: pool as any,
    })

    await adapter.insertBatch([])

    expect(queries).toHaveLength(0)
  })

  it('swallows errors via onError callback', async () => {
    const onError = vi.fn()
    const boom = new Error('db down')
    const pool = {
      query: vi.fn(async () => {
        throw boom
      }),
      end: vi.fn(async () => {}),
    }
    const adapter = postgresAdapter({
      // biome-ignore lint/suspicious/noExplicitAny: mock
      pool: pool as any,
      onError,
    })

    await expect(adapter.insertBatch([makeEntry()])).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledWith(boom)
  })

  it('rejects invalid table names at construction time', () => {
    expect(() => postgresAdapter({ tableName: 'foo; DROP TABLE x' })).toThrow()
  })

  it('does not close an injected pool by default', async () => {
    const { pool } = mockPool()
    const adapter = postgresAdapter({
      // biome-ignore lint/suspicious/noExplicitAny: mock
      pool: pool as any,
    })
    await adapter.shutdown?.()
    expect(pool.end).not.toHaveBeenCalled()
  })

  it('closes an injected pool when closePoolOnShutdown is true', async () => {
    const { pool } = mockPool()
    const adapter = postgresAdapter({
      // biome-ignore lint/suspicious/noExplicitAny: mock
      pool: pool as any,
      closePoolOnShutdown: true,
    })
    await adapter.shutdown?.()
    expect(pool.end).toHaveBeenCalledOnce()
  })

  it('runs migration once when autoMigrate is enabled', async () => {
    const { pool, queries } = mockPool()
    const adapter = postgresAdapter({
      // biome-ignore lint/suspicious/noExplicitAny: mock
      pool: pool as any,
      autoMigrate: true,
    })

    await adapter.insertBatch([makeEntry()])
    await adapter.insertBatch([makeEntry()])

    const createCalls = queries.filter((q) => q.sql.includes('CREATE TABLE'))
    expect(createCalls).toHaveLength(1)
  })
})
