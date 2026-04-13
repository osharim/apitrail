import type { ApitrailSpanProcessor } from './processor.js'

/**
 * Registers SIGTERM/SIGINT/beforeExit hooks to flush the queue on shutdown.
 *
 * Uses bracket-notation access on `process` to prevent Turbopack/Webpack
 * from flagging this file as using Node.js-only APIs when it is analyzed
 * for the Edge runtime bundle (this module is only imported from the
 * Node runtime path in `register.ts`, but bundlers may still trace it).
 */
export function registerShutdownHandlers(processor: ApitrailSpanProcessor): void {
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
