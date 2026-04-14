import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import pg from 'pg'
import { basicAuth } from './auth.js'
import { type SpansFilter, getOverview, getSpans, getTrace } from './queries.js'
import { createRateLimiter } from './rate-limit.js'
import { isValidTraceId, parseInt32, parseMethod, parsePathLike } from './validate.js'

export interface ServerOptions {
  connectionString: string
  port: number
  host: string
  tableName?: string
  ssl?: boolean
  uiDir?: string
  dev?: boolean
  /** `user:pass` for HTTP basic auth. Required if host is non-loopback. */
  authBasic?: string
}

const OVERVIEW_CACHE_MS = 1500

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown): void {
  const prefix =
    level === 'error' ? '[studio][error]' : level === 'warn' ? '[studio][warn]' : '[studio]'
  if (extra !== undefined) console[level](prefix, msg, extra)
  else console[level](prefix, msg)
}

export async function startServer(opts: ServerOptions): Promise<{
  url: string
  stop: () => Promise<void>
}> {
  const { Pool } = pg
  const pool = new Pool({
    connectionString: opts.connectionString,
    ssl: opts.ssl ? { rejectUnauthorized: false } : false,
    max: 5,
  })

  try {
    await pool.query('SELECT 1')
  } catch (err) {
    await pool.end().catch(() => {})
    const e = err as Error
    throw new Error(`Could not connect to Postgres: ${e.message}`)
  }

  const tableName = opts.tableName ?? 'apitrail_spans'
  const app = new Hono()

  // ── Security headers (defense in depth) ───────────────────────────────
  app.use('*', async (c, next) => {
    await next()
    // Conservative CSP — we load our own bundled JS/CSS from /assets/, an
    // inline favicon, and hit /api on the same origin. No 3rd-party.
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
    )
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('Permissions-Policy', 'interest-cohort=()')
    c.header('X-Robots-Tag', 'noindex, nofollow')
  })

  if (opts.dev) app.use('*', cors())

  // ── Rate limit the API (not the static UI) ────────────────────────────
  const allowRequest = createRateLimiter({ max: 300, windowMs: 60_000 })
  app.use('/api/*', async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    if (!allowRequest(ip)) {
      return c.json({ error: 'rate limit exceeded' }, 429)
    }
    await next()
  })

  // ── Basic auth (if configured) ────────────────────────────────────────
  if (opts.authBasic) {
    app.use('*', basicAuth(opts.authBasic))
  }

  app.get('/api/health', (c) => c.json({ ok: true }))

  let overviewCache: { at: number; data: unknown } | null = null
  app.get('/api/overview', async (c) => {
    try {
      if (overviewCache && Date.now() - overviewCache.at < OVERVIEW_CACHE_MS) {
        return c.json(overviewCache.data)
      }
      const raw = await getOverview(pool, tableName)
      const total = Number(raw.total_24h)
      const data = {
        total_24h: total,
        errors_24h: Number(raw.errors_24h),
        slow_24h: Number(raw.slow_24h),
        p50: Number(raw.p50 ?? 0),
        p95: Number(raw.p95 ?? 0),
        rpm: total / (24 * 60),
      }
      overviewCache = { at: Date.now(), data }
      return c.json(data)
    } catch (err) {
      log('error', 'overview failed', err)
      return c.json({ error: 'internal error' }, 500)
    }
  })

  app.get('/api/spans', async (c) => {
    try {
      const q = c.req.query()
      const filter: SpansFilter = {
        limit: parseInt32(q.limit, { min: 1, max: 500 }) ?? 50,
        method: parseMethod(q.method),
        minStatus: parseInt32(q.minStatus, { min: 100, max: 599 }),
        maxStatus: parseInt32(q.maxStatus, { min: 100, max: 599 }),
        pathLike: parsePathLike(q.pathLike),
      }
      const rows = await getSpans(pool, tableName, filter)
      return c.json(rows)
    } catch (err) {
      log('error', 'spans failed', err)
      return c.json({ error: 'internal error' }, 500)
    }
  })

  app.get('/api/trace/:id', async (c) => {
    const id = c.req.param('id')
    if (!isValidTraceId(id)) {
      return c.json({ error: 'invalid trace id' }, 400)
    }
    try {
      const data = await getTrace(pool, tableName, id)
      return c.json(data)
    } catch (err) {
      log('error', 'trace failed', err)
      return c.json({ error: 'internal error' }, 500)
    }
  })

  // ── Serve static UI ───────────────────────────────────────────────────
  const staticRoot = resolveUiDir(opts.uiDir)
  if (staticRoot && existsSync(staticRoot)) {
    app.use('/*', serveStatic({ root: staticRoot, rewriteRequestPath: (p) => p }))
    const indexHtml = join(staticRoot, 'index.html')
    if (existsSync(indexHtml)) {
      const html = readFileSync(indexHtml, 'utf8')
      app.get('*', (c) => c.html(html))
    }
  }

  const server = serve({ fetch: app.fetch, port: opts.port, hostname: opts.host })
  const url = `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${opts.port}`

  return {
    url,
    async stop() {
      server.close()
      await pool.end().catch(() => {})
    },
  }
}

function resolveUiDir(override?: string): string | null {
  if (override) return resolve(override)
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, 'ui')
}
