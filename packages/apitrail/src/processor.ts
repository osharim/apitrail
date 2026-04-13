import { SpanKind as OtelSpanKind, SpanStatusCode } from '@opentelemetry/api'
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { popCaptured } from './capture.js'
import { shouldSkipPath } from './config.js'
import { maskHeaders, maskJsonString } from './mask.js'
import type { BatchQueue } from './queue.js'
import { shouldSample } from './sampling.js'
import type { ResolvedConfig, SpanEntry, SpanKind, SpanStatus } from './types.js'

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

function detectRuntime(): SpanEntry['runtime'] {
  const r = process.env.NEXT_RUNTIME
  if (r === 'edge') return 'edge'
  if (r === 'nodejs') return 'nodejs'
  return 'unknown'
}

function mapKind(kind: OtelSpanKind): SpanKind {
  switch (kind) {
    case OtelSpanKind.SERVER:
      return 'SERVER'
    case OtelSpanKind.CLIENT:
      return 'CLIENT'
    case OtelSpanKind.PRODUCER:
      return 'PRODUCER'
    case OtelSpanKind.CONSUMER:
      return 'CONSUMER'
    default:
      return 'INTERNAL'
  }
}

function mapStatus(code: SpanStatusCode): SpanStatus {
  if (code === SpanStatusCode.OK) return 'OK'
  if (code === SpanStatusCode.ERROR) return 'ERROR'
  return 'UNSET'
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
    const kind = mapKind(span.kind)

    // If the user disabled child capture, only keep SERVER (root HTTP) spans.
    if (!this.config.captureChildren && kind !== 'SERVER') return

    const method = str(attr(span, HTTP_METHOD_KEYS))
    const path = str(attr(span, HTTP_PATH_KEYS))

    // For SERVER spans, respect skipPaths/methods/status filters.
    if (kind === 'SERVER') {
      if (!method || !path) return // not an HTTP server span
      if (shouldSkipPath(path, this.config.skipPaths)) return
      if (this.config.methods && !this.config.methods.includes(method.toUpperCase())) return
      const statusCode = num(attr(span, HTTP_STATUS_KEYS))
      if (
        this.config.statusCodes &&
        statusCode !== undefined &&
        !this.config.statusCodes.includes(statusCode)
      ) {
        return
      }
    }

    const ctx = span.spanContext()
    const durationMs = hrToMs(span.duration)
    const statusCode = num(attr(span, HTTP_STATUS_KEYS))

    // Collect all non-reserved attributes into a bag.
    const attrs: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(span.attributes)) {
      if (v === undefined || v === null) continue
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        attrs[k] = v
      }
    }

    const entry: SpanEntry = {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: span.parentSpanId ?? undefined,
      name: span.name,
      kind,
      status: mapStatus(span.status.code),
      startTime: hrToMs(span.startTime),
      durationMs,
      method: method?.toUpperCase(),
      path,
      route: str(attr(span, HTTP_ROUTE_KEYS)),
      statusCode,
      host: str(attr(span, ['server.address', 'http.host'])),
      userAgent: str(attr(span, ['user_agent.original', 'http.user_agent'])),
      clientIp: str(attr(span, ['client.address', 'net.peer.ip'])),
      referer: str(attr(span, ['http.request.header.referer'])),
      serviceName: this.config.serviceName,
      runtime: detectRuntime(),
      attributes: attrs,
    }

    if (span.status.message) {
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

    // Attach captured bodies/headers (SERVER spans only). Keyed by traceId,
    // not spanId — see comment in capture.ts.
    if (kind === 'SERVER') {
      const captured = popCaptured(ctx.traceId)
      if (captured) {
        if (this.config.captureHeaders) {
          if (captured.reqHeaders) {
            entry.reqHeaders = maskHeaders(captured.reqHeaders, this.config.maskKeys)
          }
          if (captured.resHeaders) {
            entry.resHeaders = maskHeaders(captured.resHeaders, this.config.maskKeys)
          }
        }
        if (this.config.captureBodies) {
          entry.reqBody = maskJsonString(captured.reqBody, this.config.maskKeys)
          entry.resBody = maskJsonString(captured.resBody, this.config.maskKeys)
        }
      }
    }

    if (!shouldSample(entry, this.config)) return

    this.queue.push(entry)
  }

  async forceFlush(): Promise<void> {
    await this.queue.flush()
  }

  async shutdown(): Promise<void> {
    await this.queue.shutdown()
  }
}
