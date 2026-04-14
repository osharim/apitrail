import { resolveConfig } from './config.js'
import { createSpanProcessor } from './processor.js'
import { createBatchQueue } from './queue.js'
import type { ApitrailConfig } from './types.js'

let registered = false

/**
 * Register apitrail with Next.js via `instrumentation.ts`.
 *
 * @example
 * ```ts
 * // instrumentation.ts
 * export { register } from 'apitrail'
 * ```
 */
export async function register(config?: ApitrailConfig): Promise<void> {
  if (registered) return
  registered = true

  const resolved = resolveConfig(config)

  // Edge runtime: we can't patch globals safely there, and Next.js handles
  // tracing differently. Skip quietly.
  if (process.env.NEXT_RUNTIME === 'edge') {
    if (resolved.debug) console.log('[apitrail] edge runtime detected, skipping registration')
    return
  }

  const queue = createBatchQueue({
    adapter: resolved.adapter,
    batch: resolved.batch,
    debug: resolved.debug,
  })
  const processor = createSpanProcessor(queue, resolved)

  try {
    const { registerOTel } = await import('@vercel/otel')
    // biome-ignore lint/suspicious/noExplicitAny: @vercel/otel's Instrumentation type is too narrow to re-express here
    const instrumentations = resolved.otelInstrumentations as any
    registerOTel({
      serviceName: resolved.serviceName,
      spanProcessors: [processor],
      ...(instrumentations.length > 0 ? { instrumentations } : {}),
    })

    if (resolved.captureBodies || resolved.captureHeaders) {
      const { installCapture } = await import('./capture.js')
      installCapture({
        maxBodySize: resolved.maxBodySize,
        captureBodies: resolved.captureBodies,
        captureHeaders: resolved.captureHeaders,
      })
    }

    const { registerShutdownHandlers } = await import('./shutdown.js')
    registerShutdownHandlers(processor)

    if (resolved.debug) {
      const extra = resolved.otelInstrumentations.length
        ? `, otel: ${resolved.otelInstrumentations.length} instrumentation(s)`
        : ''
      console.log(
        `[apitrail] registered (adapter: ${resolved.adapter.name}, bodies: ${resolved.captureBodies}, children: ${resolved.captureChildren}${extra})`,
      )
    }
  } catch (err) {
    console.error('[apitrail] failed to register. Install @vercel/otel or ensure Next.js 15+.', err)
  }
}
