import type { LogEntry, ResolvedConfig, StorageAdapter } from './types.js'

export class BatchQueue {
  private buffer: LogEntry[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private flushing = false
  private closed = false

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly config: ResolvedConfig['batch'],
    private readonly onError: (err: unknown) => void = (err) => {
      if (process.env.APITRAIL_DEBUG) console.error('[apitrail]', err)
    },
  ) {
    this.startTimer()
  }

  push(entry: LogEntry): void {
    if (this.closed) return
    this.buffer.push(entry)
    if (this.buffer.length >= this.config.maxSize) {
      void this.flush()
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return
    this.flushing = true
    const batch = this.buffer.splice(0, this.buffer.length)
    try {
      await this.adapter.insertBatch(batch)
    } catch (err) {
      this.onError(err)
    } finally {
      this.flushing = false
    }
  }

  async shutdown(): Promise<void> {
    this.closed = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    await this.flush()
    await this.adapter.shutdown?.()
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      void this.flush()
    }, this.config.intervalMs)
    this.timer.unref?.()
  }
}
