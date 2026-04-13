#!/usr/bin/env node
/**
 * Verification script for the @apitrail/postgres adapter.
 *
 * Usage:
 *   APITRAIL_DATABASE_URL=postgres://... node scripts/verify-postgres.mjs
 *
 * What it does:
 *   1. Connects to the provided DATABASE_URL
 *   2. Starts the Next.js dev server (assumed to be running on :3100)
 *   3. Hits a few endpoints
 *   4. Queries the apitrail_logs table and prints the most recent rows
 */

import pg from 'pg'

const url = process.env.APITRAIL_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('Set APITRAIL_DATABASE_URL or DATABASE_URL first.')
  process.exit(1)
}

const BASE = process.env.APITRAIL_BASE_URL ?? 'http://localhost:3100'

async function hit(path, init) {
  const res = await fetch(`${BASE}${path}`, init)
  console.log(`  → ${init?.method ?? 'GET'} ${path} → ${res.status}`)
}

async function main() {
  console.log('1. Hitting example endpoints...')
  await hit('/api/hello')
  await hit('/api/users')
  await hit('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"x":1}' })
  await hit('/api/boom').catch(() => {})

  console.log('\n2. Waiting 3s for batch flush...')
  await new Promise((r) => setTimeout(r, 3000))

  console.log('\n3. Querying apitrail_logs...')
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  })

  try {
    const { rows } = await pool.query(
      `SELECT trace_id, method, path, status_code, duration_ms, runtime, error_message, created_at
       FROM apitrail_logs
       ORDER BY created_at DESC
       LIMIT 10`,
    )
    console.log(`\nFound ${rows.length} recent rows:\n`)
    for (const r of rows) {
      const status = r.status_code ?? '—'
      const dur = `${Number(r.duration_ms).toFixed(0)}ms`
      const err = r.error_message ? ` ⚠ ${r.error_message}` : ''
      console.log(
        `  ${r.created_at.toISOString()}  ${r.trace_id.slice(0, 8)}  ${r.method.padEnd(5)} ${r.path.padEnd(20)} ${String(status).padStart(3)}  ${dur.padStart(6)}${err}`,
      )
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
