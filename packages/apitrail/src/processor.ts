import { SpanKind as OtelSpanKind, SpanStatusCode } from '@opentelemetry/api'
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { popCaptured, stringifyBodyRef } from './capture.js'
import { shouldSkipPath } from './config.js'
import { maskHeaders, maskJsonString, splitAndMaskPath } from './mask.js'
import type { BatchQueue } from './queue.js'
import { shouldSample } from './sampling.js'
import type { ResolvedConfig, SpanEntry, SpanKind, SpanStatus } from './types.js'

const HTTP_METHOD_KEYS = ['http.request.method', 'http.method'] as const
const HTTP_PATH_KEYS = ['url.path', 'http.target', 'http.url'] as const
const HTTP_STATUS_KEYS = ['http.response.status_code', 'http.status_code'] as const
const HTTP_ROUTE_KEYS = ['http.route', 'next.route'] as const
const HTTP_HOST_KEYS = ['server.address', 'http.host'] as const
const HTTP_UA_KEYS = ['user_agent.original', 'http.user_agent'] as const
const HTTP_IP_KEYS = ['client.address', 'net.peer.ip'] as const
const HTTP_REFERER_KEYS = ['http.request.header.referer'] as const

function attr(span: ReadableSpan, keys: readonly string[]): string | number | boolean | undefined {
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

function collectAttributes(span: ReadableSpan): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(span.attributes)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    }
  }
  return out
}

function spanToEntry(span: ReadableSpan, kind: SpanKind, config: ResolvedConfig): SpanEntry {
  const ctx = span.spanContext()
  const method = str(attr(span, HTTP_METHOD_KEYS))

  // Strip + mask any query string so API keys / tokens passed as query
  // params don't land unmasked in the canonical `path` column.
  const rawPath = str(attr(span, HTTP_PATH_KEYS))
  const { path, query } = rawPath
    ? splitAndMaskPath(rawPath, config.maskKeys)
    : { path: undefined, query: '' }

  const attrs = collectAttributes(span)
  if (query) attrs['url.query_masked'] = query

  const entry: SpanEntry = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanId ?? undefined,
    name: span.name,
    kind,
    status: mapStatus(span.status.code),
    startTime: hrToMs(span.startTime),
    durationMs: hrToMs(span.duration),
    method: method?.toUpperCase(),
    path,
    route: str(attr(span, HTTP_ROUTE_KEYS)),
    statusCode: num(attr(span, HTTP_STATUS_KEYS)),
    host: str(attr(span, HTTP_HOST_KEYS)),
    userAgent: str(attr(span, HTTP_UA_KEYS)),
    clientIp: str(attr(span, HTTP_IP_KEYS)),
    referer: str(attr(span, HTTP_REFERER_KEYS)),
    serviceName: config.serviceName,
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

  return entry
}

function attachCaptured(entry: SpanEntry, config: ResolvedConfig): void {
  const captured = popCaptured(entry.traceId)

  if (config.captureHeaders) {
    // Base-case: assemble headers from the span's OTEL attributes. Next.js
    // emits select headers as attributes (`user_agent.original`,
    // `http.host`, `client.address`, `http.request.header.*`). This covers
    // GET requests whose handlers never called req.json()/text(), where
    // the prototype hook doesn't fire.
    const fromSpan = extractHeadersFromAttributes(entry.attributes, entry)
    const merged = { ...fromSpan, ...(captured?.reqHeaders ?? {}) }
    if (Object.keys(merged).length) {
      entry.reqHeaders = maskHeaders(merged, config.maskKeys)
    }
    if (captured?.resHeaders)
      entry.resHeaders = maskHeaders(captured.resHeaders, config.maskKeys)
  }
  if (config.captureBodies && captured) {
    // Stringify deferred body refs here, OFF the request hot path.
    const reqBody = stringifyBodyRef(captured.reqBodyRef, config.maxBodySize)
    const resBody = stringifyBodyRef(captured.resBodyRef, config.maxBodySize)
    entry.reqBody = maskJsonString(reqBody, config.maskKeys)
    entry.resBody = maskJsonString(resBody, config.maskKeys)
  }
}

/**
 * Harvest request-header data from the OTEL span attributes so GET requests
 * — which usually don't read a body and therefore never trigger the
 * capture hook — still get meaningful req_headers.
 */
function extractHeadersFromAttributes(
  attrs: SpanEntry['attributes'],
  entry: SpanEntry,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue
    const lower = k.toLowerCase()
    if (lower.startsWith('http.request.header.')) {
      const name = lower.slice('http.request.header.'.length)
      out[name] = String(v)
    }
  }
  // Canonical entries that Next.js sets as first-class attributes
  if (entry.userAgent) out['user-agent'] = entry.userAgent
  if (entry.host) out.host = entry.host
  if (entry.referer) out.referer = entry.referer
  return out
}

function passesServerFilters(
  method: string | undefined,
  path: string | undefined,
  statusCode: number | undefined,
  config: ResolvedConfig,
): boolean {
  if (!method || !path) return false
  if (shouldSkipPath(path, config.skipPaths)) return false
  if (config.methods && !config.methods.includes(method.toUpperCase())) return false
  if (config.statusCodes && statusCode !== undefined && !config.statusCodes.includes(statusCode)) {
    return false
  }
  return true
}

export function createSpanProcessor(queue: BatchQueue, config: ResolvedConfig): SpanProcessor {
  return {
    onStart() {
      // no-op — we capture on end
    },

    onEnd(span) {
      try {
        const kind = mapKind(span.kind)

        // Skip child spans when disabled.
        if (!config.captureChildren && kind !== 'SERVER') return

        // SERVER spans have extra filtering (skipPaths, methods, statusCodes).
        if (kind === 'SERVER') {
          const method = str(attr(span, HTTP_METHOD_KEYS))
          const path = str(attr(span, HTTP_PATH_KEYS))
          const statusCode = num(attr(span, HTTP_STATUS_KEYS))
          if (!passesServerFilters(method, path, statusCode, config)) return
        }

        const entry = spanToEntry(span, kind, config)
        if (kind === 'SERVER') attachCaptured(entry, config)
        if (!shouldSample(entry, config)) return

        queue.push(entry)
      } catch (err) {
        if (config.debug) console.error('[apitrail] processor error', err)
      }
    },

    async forceFlush() {
      await queue.flush()
    },

    async shutdown() {
      await queue.shutdown()
    },
  }
}
