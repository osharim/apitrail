import { trace } from '@opentelemetry/api'

export interface Captured {
  reqHeaders?: Record<string, string>
  reqBody?: string
  resHeaders?: Record<string, string>
  resBody?: string
}

/**
 * Captured bodies/headers are keyed by traceId, not spanId. Reason: when a
 * route handler calls `req.json()` or returns `Response.json(...)`, the OTEL
 * active span at that moment is usually an *internal* span (e.g. "executing
 * api route"), not the root HTTP SERVER span. Keying by traceId ensures the
 * SERVER span can find the captured data at onEnd time.
 */
const store = new Map<string, Captured>()

function currentKey(): string | undefined {
  const span = trace.getActiveSpan()
  return span?.spanContext().traceId
}

function getOrCreate(key: string): Captured {
  let c = store.get(key)
  if (!c) {
    c = {}
    store.set(key, c)
  }
  return c
}

export function popCaptured(traceId: string): Captured | undefined {
  const c = store.get(traceId)
  if (c) store.delete(traceId)
  return c
}

function headersToObject(h: Headers): Record<string, string> {
  const obj: Record<string, string> = {}
  h.forEach((value, key) => {
    obj[key] = value
  })
  return obj
}

function stringifyBody(body: unknown, maxBytes: number): string | undefined {
  if (body === null || body === undefined) return undefined

  const truncate = (s: string): string => {
    if (maxBytes < 0 || s.length <= maxBytes) return s
    return `${s.slice(0, maxBytes)}…[truncated ${s.length - maxBytes} chars]`
  }

  if (typeof body === 'string') return truncate(body)

  if (body instanceof Uint8Array) {
    try {
      return truncate(new TextDecoder('utf-8', { fatal: false }).decode(body))
    } catch {
      return `[binary ${body.byteLength}B]`
    }
  }

  if (body instanceof ArrayBuffer) {
    return stringifyBody(new Uint8Array(body), maxBytes)
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return '[stream]'
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return `[blob ${body.size}B type=${body.type}]`
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const obj: Record<string, string> = {}
    body.forEach((value, key) => {
      obj[key] = typeof value === 'string' ? value : '[file]'
    })
    return truncate(JSON.stringify(obj))
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return truncate(body.toString())
  }

  // Object, passed directly to Response body — serialize as JSON
  try {
    return truncate(JSON.stringify(body))
  } catch {
    return undefined
  }
}

interface InstallOptions {
  maxBodySize: number
  captureBodies: boolean
  captureHeaders: boolean
}

const PATCH_MARK = Symbol.for('apitrail.patched')

export function installCapture(options: InstallOptions): void {
  const { maxBodySize, captureBodies, captureHeaders } = options

  const globalCast = globalThis as unknown as Record<symbol, boolean>
  if (globalCast[PATCH_MARK]) return
  globalCast[PATCH_MARK] = true

  if (captureHeaders || captureBodies) patchRequest({ maxBodySize, captureBodies, captureHeaders })
  if (captureBodies || captureHeaders) patchResponse({ maxBodySize, captureBodies, captureHeaders })
}

function patchRequest(opts: InstallOptions): void {
  if (typeof Request === 'undefined') return
  // Cast to a mutable shape — the DOM lib types these as readonly on the prototype,
  // but at runtime they are plain assignable functions.
  const proto = Request.prototype as unknown as Record<string, (...args: unknown[]) => unknown>

  const origJson = proto.json as (this: Request) => Promise<unknown>
  proto.json = async function patchedJson(this: Request) {
    const value = await origJson.call(this)
    const key = currentKey()
    if (key) {
      const c = getOrCreate(key)
      if (opts.captureHeaders && !c.reqHeaders) c.reqHeaders = headersToObject(this.headers)
      if (opts.captureBodies && c.reqBody === undefined) {
        c.reqBody = stringifyBody(value, opts.maxBodySize)
      }
    }
    return value
  } as (...args: unknown[]) => unknown

  const origText = proto.text as (this: Request) => Promise<string>
  proto.text = async function patchedText(this: Request) {
    const value = await origText.call(this)
    const key = currentKey()
    if (key) {
      const c = getOrCreate(key)
      if (opts.captureHeaders && !c.reqHeaders) c.reqHeaders = headersToObject(this.headers)
      if (opts.captureBodies && c.reqBody === undefined) {
        c.reqBody = stringifyBody(value, opts.maxBodySize)
      }
    }
    return value
  } as (...args: unknown[]) => unknown

  const origFormData = proto.formData as (this: Request) => Promise<FormData>
  proto.formData = async function patchedFormData(this: Request) {
    const value = await origFormData.call(this)
    const key = currentKey()
    if (key) {
      const c = getOrCreate(key)
      if (opts.captureHeaders && !c.reqHeaders) c.reqHeaders = headersToObject(this.headers)
      if (opts.captureBodies && c.reqBody === undefined) {
        c.reqBody = stringifyBody(value, opts.maxBodySize)
      }
    }
    return value
  } as (...args: unknown[]) => unknown
}

function patchResponse(opts: InstallOptions): void {
  if (typeof Response === 'undefined') return

  const OrigResponse = Response as unknown as new (
    body?: unknown,
    init?: ResponseInit,
  ) => Response
  const origStaticJson = (
    Response as unknown as { json: (data: unknown, init?: ResponseInit) => Response }
  ).json

  function captureFromResponse(body: unknown, resp: Response): void {
    const key = currentKey()
    if (!key) return
    const c = getOrCreate(key)
    if (opts.captureHeaders && !c.resHeaders) c.resHeaders = headersToObject(resp.headers)
    if (opts.captureBodies && c.resBody === undefined) {
      c.resBody = stringifyBody(body, opts.maxBodySize)
    }
  }

  function PatchedResponse(this: unknown, body?: unknown, init?: ResponseInit): Response {
    // Support both `new Response(...)` and `Response(...)` — though the latter
    // throws in browsers, some polyfills allow it. We mirror the original API.
    const resp = new OrigResponse(body, init)
    captureFromResponse(body, resp)
    return resp
  }

  // Preserve the prototype chain so `instanceof Response` still works.
  PatchedResponse.prototype = OrigResponse.prototype

  // Static methods.
  ;(PatchedResponse as unknown as { json: typeof origStaticJson }).json = (
    data: unknown,
    init?: ResponseInit,
  ) => {
    const resp = origStaticJson(data, init)
    captureFromResponse(data, resp)
    return resp
  }

  for (const staticKey of ['error', 'redirect'] as const) {
    const orig = (Response as unknown as Record<string, unknown>)[staticKey]
    if (typeof orig === 'function') {
      ;(PatchedResponse as unknown as Record<string, unknown>)[staticKey] = orig.bind(Response)
    }
  }

  // Swap the global. Use defineProperty to handle the non-writable edge case.
  try {
    ;(globalThis as unknown as { Response: unknown }).Response = PatchedResponse
  } catch {
    // If we can't replace it, bail silently.
  }
}
