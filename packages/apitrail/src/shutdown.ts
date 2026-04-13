import type { SpanProcessor } from '@opentelemetry/sdk-trace-base'

/**
 * Register SIGTERM / SIGINT / beforeExit hooks that flush the queue on
 * shutdown. This module is only imported from the Node runtime path in
 * `register.ts`; callers must not import it from Edge code.
 */
export function registerShutdownHandlers(processor: SpanProcessor): void {
  if (typeof process === 'undefined' || typeof process.once !== 'function') return

  const shutdown = async (): Promise<void> => {
    await processor.shutdown()
  }

  process.once('SIGTERM', () => {
    void shutdown()
  })
  process.once('SIGINT', () => {
    void shutdown()
  })
  process.once('beforeExit', () => {
    void shutdown()
  })
}
