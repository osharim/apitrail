import { resolveConfig } from './config.js'
import { ApitrailSpanProcessor } from './processor.js'
import { BatchQueue } from './queue.js'
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

  const queue = new BatchQueue(resolved.adapter, resolved.batch)
  const processor = new ApitrailSpanProcessor(queue, resolved)

  try {
    const { registerOTel } = await import('@vercel/otel')
    registerOTel({
      serviceName: resolved.serviceName,
      spanProcessors: [processor],
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
      console.log(
        `[apitrail] registered (adapter: ${resolved.adapter.name}, bodies: ${resolved.captureBodies}, children: ${resolved.captureChildren})`,
      )
    }
  } catch (err) {
    console.error(
      '[apitrail] failed to register. Install @vercel/otel or ensure Next.js 15+.',
      err,
    )
  }
}
