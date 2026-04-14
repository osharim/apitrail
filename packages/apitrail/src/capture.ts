import { trace } from '@opentelemetry/api'

/**
 * Deferred-stringify capture of HTTP request + response bodies and headers.
 *
 * Design decisions:
 *
 * 1. **Keyed by traceId, not spanId.**
 *    When a route handler calls `req.json()` or returns `Response.json(...)`,
 *    the OTEL active span at that moment is usually an internal span (e.g.
 *    "executing api route"), not the root HTTP SERVER span. Keying by traceId
 *    lets the SERVER span find the captured data at onEnd time.
 *
 * 2. **Last-wins for Response.**
 *    A single request frequently constructs multiple Response objects — e.g.
 *    NextAuth's session fetch builds one with `{user: ...}` before your
 *    handler returns `Response.json(quotes)`. Using first-wins would persist
 *    the session body attached to your /api/quotes row. Last-wins keeps the
 *    final user-facing Response, which is what we actually want to observe.
 *
 * 3. **Store body references, stringify at span end.**
 *    `JSON.stringify` on a multi-kB response can add measurable latency if
 *    run synchronously inside `new Response(body)`. Instead we keep a
 *    reference and serialise in the processor's onEnd — which runs AFTER
 *    Next.js has already sent the response to the wire. Result: zero
 *    apparent overhead on the request path.
 *
 * 4. **Request body uses first-wins.**
 *    Handlers usually call `req.json()` once. If they `.clone()` and read
 *    again, the first parsed value is still the canonical incoming body.
 *
 * 5. **Request headers captured on construction, not on body read.**
 *    GET requests rarely read a body — patching only body methods misses
 *    their headers. Patching the Request constructor catches every incoming
 *    request regardless of whether the handler reads the body.
 */

export interface Captured {
  reqHeaders?: Record<string, string>
  reqBodyRef?: unknown
  reqBodyCaptured?: boolean
  resHeaders?: Record<string, string>
  resBodyRef?: unknown
}

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

interface InstallOptions {
  maxBodySize: number
  captureBodies: boolean
  captureHeaders: boolean
}

const PATCH_MARK = Symbol.for('apitrail.patched')

export function installCapture(options: InstallOptions): void {
  const { captureBodies, captureHeaders } = options

  const globalCast = globalThis as unknown as Record<symbol, boolean>
  if (globalCast[PATCH_MARK]) return
  globalCast[PATCH_MARK] = true

  if (captureHeaders || captureBodies) {
    patchRequestConstructor(options)
    patchRequestBodyMethods(options)
    patchResponse(options)
  }
}

/**
 * Patch the global Request constructor so we grab headers as soon as an
 * incoming Request object exists — crucial for GET requests whose handlers
 * never call json()/text()/formData().
 */
function patchRequestConstructor(opts: InstallOptions): void {
  if (typeof Request === 'undefined') return

  const OrigRequest = Request as unknown as new (input: unknown, init?: RequestInit) => Request

  function PatchedRequest(this: unknown, input: unknown, init?: RequestInit): Request {
    const req = new OrigRequest(input, init)
    const key = currentKey()
    if (key) {
      const c = getOrCreate(key)
      // First-wins for headers — the incoming request's headers are the
      // canonical ones; subsequent clones or framework-created Requests
      // shouldn't clobber them.
      if (opts.captureHeaders && !c.reqHeaders) {
        c.reqHeaders = headersToObject(req.headers)
      }
    }
    return req
  }

  PatchedRequest.prototype = OrigRequest.prototype

  try {
    ;(globalThis as unknown as { Request: unknown }).Request = PatchedRequest
  } catch {
    // If the global is frozen, fall back to prototype-method patching below.
  }
}

/**
 * Fallback patch on Request.prototype body methods — catches headers for
 * requests whose constructor runs before this module loads (e.g. a Request
 * already crossed the middleware boundary). Also how we capture the request
 * body, which isn't available until the handler asks for it.
 */
function patchRequestBodyMethods(opts: InstallOptions): void {
  if (typeof Request === 'undefined') return
  const proto = Request.prototype as unknown as Record<string, (...args: unknown[]) => unknown>

  const patchReader = <T>(name: 'json' | 'text' | 'formData'): void => {
    const original = proto[name] as (this: Request) => Promise<T>
    proto[name] = async function patched(this: Request) {
      const value = await original.call(this)
      const key = currentKey()
      if (key) {
        const c = getOrCreate(key)
        if (opts.captureHeaders && !c.reqHeaders) c.reqHeaders = headersToObject(this.headers)
        if (opts.captureBodies && !c.reqBodyCaptured) {
          c.reqBodyRef = value
          c.reqBodyCaptured = true
        }
      }
      return value
    } as (...args: unknown[]) => unknown
  }

  patchReader<unknown>('json')
  patchReader<string>('text')
  patchReader<FormData>('formData')
}

/**
 * Patch the global Response constructor + `Response.json` static.
 *
 * Last-wins: every Response overwrites the capture. Your route's
 * `return Response.json(data)` runs AFTER any framework-internal
 * Response construction (NextAuth session etc.), so it ends up being the
 * captured one.
 */
function patchResponse(opts: InstallOptions): void {
  if (typeof Response === 'undefined') return

  const OrigResponse = Response as unknown as new (body?: unknown, init?: ResponseInit) => Response
  const origStaticJson = (
    Response as unknown as { json: (data: unknown, init?: ResponseInit) => Response }
  ).json

  function captureFromResponse(body: unknown, resp: Response): void {
    const key = currentKey()
    if (!key) return
    const c = getOrCreate(key)
    // Last-wins: always overwrite.
    if (opts.captureHeaders) c.resHeaders = headersToObject(resp.headers)
    if (opts.captureBodies) c.resBodyRef = body
  }

  function PatchedResponse(this: unknown, body?: unknown, init?: ResponseInit): Response {
    const resp = new OrigResponse(body, init)
    captureFromResponse(body, resp)
    return resp
  }

  PatchedResponse.prototype = OrigResponse.prototype
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

  try {
    ;(globalThis as unknown as { Response: unknown }).Response = PatchedResponse
  } catch {
    // Non-fatal — if the global is sealed we simply miss response captures.
  }
}

/**
 * Serialise a captured body reference to a UTF-16 string, truncating at
 * `maxBytes` characters. Called from the processor on span end, so the cost
 * is off the request path.
 */
export function stringifyBodyRef(body: unknown, maxBytes: number): string | undefined {
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
    return stringifyBodyRef(new Uint8Array(body), maxBytes)
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

  try {
    return truncate(JSON.stringify(body))
  } catch {
    return undefined
  }
}
