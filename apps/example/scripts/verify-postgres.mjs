#!/usr/bin/env node
import pg from 'pg'

const url = process.env.APITRAIL_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('Set APITRAIL_DATABASE_URL or DATABASE_URL first.')
  process.exit(1)
}

const BASE = process.env.APITRAIL_BASE_URL ?? 'http://localhost:3100'

async function hit(path, init) {
  const res = await fetch(`${BASE}${path}`, init).catch(() => null)
  console.log(`  → ${init?.method ?? 'GET'} ${path} → ${res?.status ?? 'err'}`)
}

async function main() {
  console.log('1. Hitting example endpoints...')
  await hit('/api/hello')
  await hit('/api/users')
  await hit('/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer super-secret-token' },
    body: JSON.stringify({ name: 'Ada', password: 'hunter2' }),
  })
  await hit('/api/boom')

  console.log('\n2. Waiting 3s for batch flush...')
  await new Promise((r) => setTimeout(r, 3000))

  console.log('\n3. Querying apitrail_spans...')
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  })

  try {
    // Root HTTP requests
    const { rows: servers } = await pool.query(
      `SELECT trace_id, span_id, method, path, status_code, duration_ms, req_body, res_body,
              req_headers, error_message
         FROM apitrail_spans
        WHERE kind = 'SERVER'
        ORDER BY created_at DESC
        LIMIT 10`,
    )

    console.log(`\n=== ${servers.length} recent HTTP requests ===\n`)
    for (const r of servers) {
      const dur = `${Number(r.duration_ms).toFixed(0)}ms`
      const status = r.status_code ?? '—'
      console.log(
        `${r.trace_id.slice(0, 8)}  ${String(r.method).padEnd(5)} ${r.path.padEnd(20)} ${String(status).padStart(3)}  ${dur.padStart(6)}`,
      )
      if (r.req_body) console.log(`   req body : ${r.req_body}`)
      if (r.req_headers?.authorization)
        console.log(`   req auth : ${r.req_headers.authorization}`)
      if (r.res_body) console.log(`   res body : ${truncate(r.res_body, 120)}`)
      if (r.error_message) console.log(`   error    : ${r.error_message}`)

      // Children of this trace
      const { rows: children } = await pool.query(
        `SELECT name, kind, duration_ms
           FROM apitrail_spans
          WHERE trace_id = $1 AND span_id != $2
          ORDER BY start_time`,
        [r.trace_id, r.span_id],
      )
      if (children.length > 0) {
        console.log(`   ├─ ${children.length} child span(s):`)
        for (const c of children) {
          console.log(`   │   ${c.kind.padEnd(8)} ${c.name} (${Number(c.duration_ms).toFixed(1)}ms)`)
        }
      }
      console.log()
    }

    const { rows: counts } = await pool.query(
      `SELECT kind, count(*)::int FROM apitrail_spans GROUP BY kind ORDER BY count DESC`,
    )
    console.log('=== span count by kind ===')
    for (const c of counts) console.log(`  ${c.kind.padEnd(10)} ${c.count}`)
  } finally {
    await pool.end()
  }
}

function truncate(s, max) {
  if (!s) return s
  return s.length > max ? `${s.slice(0, max)}…` : s
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
