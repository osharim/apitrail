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
    patchRequestWithProxy(options)
    patchRequestBodyMethods(options)
    patchResponse(options)
    // Don't await — NextResponse patching can happen after the first requests
    // start flowing; it still fixes subsequent ones. Guarded against failures.
    void patchNextResponse(options)
  }
}

/**
 * Patch `NextResponse` from `next/server` — the class Next.js route handlers
 * usually return (`NextResponse.json(...)`, `new NextResponse(...)`,
 * `NextResponse.redirect(...)`).
 *
 * `NextResponse extends Response`, but the `extends Response` binding was
 * captured at class-definition time against the ORIGINAL `Response` (not
 * our patched global), so `super(body, init)` inside NextResponse bypasses
 * our global Response patch. This function patches NextResponse's own
 * static methods + constructor so we see the body anyway.
 *
 * Safe to call from any runtime: if `next/server` isn't importable (e.g.
 * Edge bundle, non-Next.js app) we silently no-op.
 */
async function patchNextResponse(opts: InstallOptions): Promise<void> {
  try {
    const mod = (await import('next/server')) as {
      NextResponse?: {
        new (body?: unknown, init?: ResponseInit): Response
        json?: (data: unknown, init?: ResponseInit) => Response
        redirect?: (...args: unknown[]) => Response
        rewrite?: (...args: unknown[]) => Response
        next?: (...args: unknown[]) => Response
      }
    }
    const NextResponse = mod.NextResponse
    if (!NextResponse) return

    const captureFromResponse = (body: unknown, resp: Response): void => {
      const key = currentKey()
      if (!key) return
      const c = getOrCreate(key)
      if (opts.captureHeaders) c.resHeaders = headersToObject(resp.headers)
      if (opts.captureBodies) c.resBodyRef = body
    }

    // Wrap NextResponse.json — the most common path for App Router handlers.
    const origJson = NextResponse.json
    if (typeof origJson === 'function') {
      try {
        NextResponse.json = function patchedNextJson(
          data: unknown,
          init?: ResponseInit,
        ): Response {
          const resp = origJson.call(NextResponse, data, init)
          captureFromResponse(data, resp)
          return resp
        }
      } catch {
        // Non-writable static — skip
      }
    }

    // Wrap the constructor via prototype-chain-friendly Proxy. We set the
    // patched version back as the module export if the binding is writable.
    const Patched = new Proxy(NextResponse, {
      construct(target, args, newTarget) {
        const resp = Reflect.construct(target, args, newTarget) as Response
        try {
          captureFromResponse(args[0], resp)
        } catch {
          // Never break the response path.
        }
        return resp
      },
    })
    try {
      ;(mod as unknown as { NextResponse: unknown }).NextResponse = Patched
    } catch {
      // ES-module live binding — the direct reimport still resolves to the
      // wrapped static (we patched .json above). We lose the `new NextResponse`
      // capture path but keep the commonest one.
    }
  } catch {
    // next/server unavailable — silent no-op
  }
}

/**
 * Wrap the global `Request` constructor in a Proxy so we can observe
 * every `new Request(...)` call without breaking identity semantics.
 *
 * Why a Proxy and not a plain function wrapper:
 *  - Preserves `instanceof Request` checks — `Reflect.construct` returns
 *    an instance of the original class.
 *  - Preserves all static methods (Proxy default-forwards property reads
 *    to the target).
 *  - Preserves `new.target` for anyone subclassing Request.
 *  - Preserves the original `.prototype` identity.
 *  - Earlier attempt (plain function) broke Next.js's internal URL
 *    plumbing with `Cannot read properties of undefined (reading
 *    'pathname')`; Proxy fixes that.
 */
function patchRequestWithProxy(opts: InstallOptions): void {
  if (typeof Request === 'undefined') return

  const OrigRequest = Request

  const PatchedRequest = new Proxy(OrigRequest, {
    construct(target, args, newTarget) {
      const req = Reflect.construct(target, args, newTarget) as Request
      try {
        const key = currentKey()
        if (key) {
          const c = getOrCreate(key)
          // First-wins: incoming Request is canonical; clones / framework
          // wrappers created later shouldn't overwrite these headers.
          if (opts.captureHeaders && !c.reqHeaders) {
            c.reqHeaders = headersToObject(req.headers)
          }
        }
      } catch {
        // Never let the capture path break the Request construction.
      }
      return req
    },
  })

  try {
    ;(globalThis as unknown as { Request: unknown }).Request = PatchedRequest
  } catch {
    // Global frozen — prototype patches still run.
  }
}

/**
 * Patch Request.prototype body methods. Fires when the handler calls
 * req.json() / req.text() / req.formData() and captures both the parsed
 * body (as a reference, stringified later) and the request headers.
 *
 * GET requests that never call these methods have their header info
 * enriched from OTEL span attributes at processor.onEnd time instead.
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
