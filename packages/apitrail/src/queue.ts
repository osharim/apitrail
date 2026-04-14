import type { ResolvedConfig, SpanEntry, StorageAdapter } from './types.js'

export interface BatchQueue {
  push: (entry: SpanEntry) => void
  flush: () => Promise<void>
  shutdown: () => Promise<void>
}

export interface BatchQueueOptions {
  adapter: StorageAdapter
  batch: ResolvedConfig['batch']
  debug?: boolean
}

export function createBatchQueue({ adapter, batch, debug = false }: BatchQueueOptions): BatchQueue {
  let buffer: SpanEntry[] = []
  let flushing = false
  let closed = false

  const onError = (err: unknown): void => {
    if (debug) console.error('[apitrail]', err)
  }

  const flush = async (): Promise<void> => {
    if (flushing || buffer.length === 0) return
    flushing = true
    const entries = buffer
    buffer = []
    try {
      await adapter.insertBatch(entries)
    } catch (err) {
      onError(err)
    } finally {
      flushing = false
    }
  }

  const timer = setInterval(() => {
    void flush()
  }, batch.intervalMs)
  timer.unref?.()

  return {
    push(entry) {
      if (closed) return
      buffer.push(entry)
      if (buffer.length >= batch.maxSize) void flush()
    },

    flush,

    async shutdown() {
      closed = true
      clearInterval(timer)
      await flush()
      await adapter.shutdown?.()
    },
  }
}
