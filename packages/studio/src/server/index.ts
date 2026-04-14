import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import pg from 'pg'
import { type SpansFilter, getOverview, getSpans, getTrace } from './queries.js'

export interface ServerOptions {
  connectionString: string
  port: number
  host: string
  tableName?: string
  ssl?: boolean
  uiDir?: string
  dev?: boolean
}

const OVERVIEW_CACHE_MS = 1500 // tiny cache so rapid polling doesn't hammer PG

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

  // Verify connection upfront — fail fast with a clear error.
  try {
    await pool.query('SELECT 1')
  } catch (err) {
    await pool.end().catch(() => {})
    const e = err as Error
    throw new Error(`Could not connect to Postgres: ${e.message}`)
  }

  const tableName = opts.tableName ?? 'apitrail_spans'

  const app = new Hono()
  if (opts.dev) app.use('*', cors())

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
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.get('/api/spans', async (c) => {
    try {
      const q = c.req.query()
      const filter: SpansFilter = {
        limit: q.limit ? Number(q.limit) : undefined,
        method: q.method || undefined,
        minStatus: q.minStatus ? Number(q.minStatus) : undefined,
        maxStatus: q.maxStatus ? Number(q.maxStatus) : undefined,
        pathLike: q.pathLike || undefined,
      }
      const rows = await getSpans(pool, tableName, filter)
      return c.json(rows)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.get('/api/trace/:id', async (c) => {
    try {
      const id = c.req.param('id')
      if (!/^[0-9a-f]{32}$/i.test(id)) {
        return c.json({ error: 'invalid trace id' }, 400)
      }
      const data = await getTrace(pool, tableName, id)
      return c.json(data)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  // Serve static UI assets from dist/ui/ — resolve robustly for both dev and
  // published-package layouts.
  const staticRoot = resolveUiDir(opts.uiDir)
  if (staticRoot && existsSync(staticRoot)) {
    app.use(
      '/*',
      serveStatic({
        root: staticRoot,
        rewriteRequestPath: (p) => p,
      }),
    )
    // SPA fallback → serve index.html on unknown routes
    const indexHtml = join(staticRoot, 'index.html')
    if (existsSync(indexHtml)) {
      const html = readFileSync(indexHtml, 'utf8')
      app.get('*', (c) => c.html(html))
    }
  }

  const server = serve({
    fetch: app.fetch,
    port: opts.port,
    hostname: opts.host,
  })

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
  // When running from `dist/cli.js` inside the published package:
  //   <pkg-root>/dist/cli.js → <pkg-root>/dist/ui/
  const here = dirname(fileURLToPath(import.meta.url))
  const candidate = join(here, 'ui')
  return candidate
}
