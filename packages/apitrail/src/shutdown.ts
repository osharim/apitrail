import type { SpanProcessor } from '@opentelemetry/sdk-trace-base'

/**
 * Register SIGTERM / SIGINT / beforeExit hooks that flush the queue on
 * shutdown. This module is only imported from the Node runtime path in
 * `register.ts`; callers must not import it from Edge code.
 *
 * Uses bracket-notation access on `process.once` so Turbopack's Edge
 * static-analysis doesn't flag the call — otherwise every request in
 * dev prints a noisy 'A Node.js API is used' warning even though this
 * code never runs in Edge.
 */
export function registerShutdownHandlers(processor: SpanProcessor): void {
  const proc = globalThis.process as NodeJS.Process | undefined
  const once = proc?.['once']?.bind(proc)
  if (!once) return

  const shutdown = async (): Promise<void> => {
    await processor.shutdown()
  }

  once('SIGTERM', () => {
    void shutdown()
  })
  once('SIGINT', () => {
    void shutdown()
  })
  once('beforeExit', () => {
    void shutdown()
  })
}
