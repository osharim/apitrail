import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchQueue } from '../src/queue.js'
import type { LogEntry, StorageAdapter } from '../src/types.js'

function makeEntry(path = '/api/x'): LogEntry {
  return {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    timestamp: Date.now(),
    method: 'GET',
    path,
    durationMs: 10,
    runtime: 'nodejs',
    attributes: {},
  }
}

describe('BatchQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes when maxSize is reached', async () => {
    const inserted: LogEntry[][] = []
    const adapter: StorageAdapter = {
      name: 'test',
      insertBatch: (e) => {
        inserted.push(e)
      },
    }
    const q = new BatchQueue(adapter, { maxSize: 3, intervalMs: 60_000 })
    q.push(makeEntry())
    q.push(makeEntry())
    expect(inserted).toHaveLength(0)
    q.push(makeEntry())
    await vi.runOnlyPendingTimersAsync()
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toHaveLength(3)
    await q.shutdown()
  })

  it('flushes on interval', async () => {
    const inserted: LogEntry[][] = []
    const adapter: StorageAdapter = {
      name: 'test',
      insertBatch: (e) => {
        inserted.push(e)
      },
    }
    const q = new BatchQueue(adapter, { maxSize: 100, intervalMs: 1000 })
    q.push(makeEntry())
    q.push(makeEntry())
    await vi.advanceTimersByTimeAsync(1100)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toHaveLength(2)
    await q.shutdown()
  })

  it('flushes remaining entries on shutdown', async () => {
    const inserted: LogEntry[][] = []
    const adapter: StorageAdapter = {
      name: 'test',
      insertBatch: (e) => {
        inserted.push(e)
      },
    }
    const q = new BatchQueue(adapter, { maxSize: 100, intervalMs: 60_000 })
    q.push(makeEntry())
    await q.shutdown()
    expect(inserted).toHaveLength(1)
  })

  it('ignores pushes after shutdown', async () => {
    const adapter: StorageAdapter = { name: 'test', insertBatch: () => {} }
    const q = new BatchQueue(adapter, { maxSize: 100, intervalMs: 60_000 })
    await q.shutdown()
    q.push(makeEntry())
  })
})
