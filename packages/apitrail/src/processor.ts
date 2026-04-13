import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { shouldSkipPath } from './config.js'
import type { BatchQueue } from './queue.js'
import type { LogEntry, ResolvedConfig } from './types.js'

const HTTP_METHOD_KEYS = ['http.request.method', 'http.method'] as const
const HTTP_PATH_KEYS = ['url.path', 'http.target', 'http.url'] as const
const HTTP_STATUS_KEYS = ['http.response.status_code', 'http.status_code'] as const
const HTTP_ROUTE_KEYS = ['http.route', 'next.route'] as const

function attr(
  span: ReadableSpan,
  keys: readonly string[],
): string | number | boolean | undefined {
  for (const k of keys) {
    const v = span.attributes[k]
    if (v !== undefined) return v as string | number | boolean
  }
  return undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : v === undefined ? undefined : String(v)
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function hrToMs(hr: [number, number]): number {
  return hr[0] * 1000 + hr[1] / 1e6
}

function detectRuntime(): LogEntry['runtime'] {
  const r = process.env.NEXT_RUNTIME
  if (r === 'edge') return 'edge'
  if (r === 'nodejs') return 'nodejs'
  return 'unknown'
}

export class ApitrailSpanProcessor implements SpanProcessor {
  constructor(
    private readonly queue: BatchQueue,
    private readonly config: ResolvedConfig,
  ) {}

  onStart(): void {
    // no-op — we capture on end
  }

  onEnd(span: ReadableSpan): void {
    try {
      this.handle(span)
    } catch (err) {
      if (this.config.debug) console.error('[apitrail] processor error', err)
    }
  }

  private handle(span: ReadableSpan): void {
    const method = str(attr(span, HTTP_METHOD_KEYS))
    if (!method) return // not an HTTP span

    const path = str(attr(span, HTTP_PATH_KEYS))
    if (!path) return

    if (shouldSkipPath(path, this.config.skipPaths)) return

    if (this.config.methods && !this.config.methods.includes(method.toUpperCase())) return

    if (this.config.sampleRate < 1 && Math.random() > this.config.sampleRate) return

    const statusCode = num(attr(span, HTTP_STATUS_KEYS))
    if (
      this.config.statusCodes &&
      statusCode !== undefined &&
      !this.config.statusCodes.includes(statusCode)
    ) {
      return
    }

    const ctx = span.spanContext()
    const durationMs = hrToMs(span.duration)

    const entry: LogEntry = {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      timestamp: hrToMs(span.startTime),
      method: method.toUpperCase(),
      path,
      route: str(attr(span, HTTP_ROUTE_KEYS)),
      statusCode,
      durationMs,
      userAgent: str(attr(span, ['user_agent.original', 'http.user_agent'])),
      clientIp: str(attr(span, ['client.address', 'net.peer.ip'])),
      host: str(attr(span, ['server.address', 'http.host'])),
      referer: str(attr(span, ['http.request.header.referer'])),
      runtime: detectRuntime(),
      attributes: {},
    }

    if (span.status.code === 2 /* ERROR */ && span.status.message) {
      entry.error = { message: span.status.message }
    }

    for (const event of span.events) {
      if (event.name === 'exception' && event.attributes) {
        entry.error = {
          message: str(event.attributes['exception.message']) ?? 'Unknown error',
          stack: str(event.attributes['exception.stacktrace']),
        }
      }
    }

    this.queue.push(entry)
  }

  async forceFlush(): Promise<void> {
    await this.queue.flush()
  }

  async shutdown(): Promise<void> {
    await this.queue.shutdown()
  }
}
