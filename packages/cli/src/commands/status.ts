import { parseArgs } from 'node:util'
import { bold, cyan, dim, gray, green, red, yellow } from '../utils/colors.js'
import { openPool, resolveUrl } from '../utils/db.js'

const HELP = `
${bold('apitrail status')} — inspect apitrail rows and recent activity

${bold('Usage:')}
  apitrail status [options]

${bold('Options:')}
  --url <url>       Postgres connection string (or APITRAIL_DATABASE_URL / DATABASE_URL)
  --table <name>    Table name (default: apitrail_spans)
  --limit <n>       Recent rows to show (default: 10)
  --no-ssl          Disable SSL
  -h, --help        Show this help
`

interface Row {
  created_at: Date
  trace_id: string
  method: string | null
  path: string | null
  status_code: number | null
  duration_ms: string | number
  error_message: string | null
}

function fmtStatus(code: number | null): string {
  if (code === null) return gray('—')
  const s = String(code).padStart(3)
  if (code >= 500) return red(s)
  if (code >= 400) return yellow(s)
  if (code >= 300) return cyan(s)
  return green(s)
}

function fmtDuration(ms: number): string {
  const s = `${ms.toFixed(0)}ms`.padStart(7)
  if (ms > 1000) return red(s)
  if (ms > 500) return yellow(s)
  return gray(s)
}

export async function status(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string' },
      table: { type: 'string', default: 'apitrail_spans' },
      limit: { type: 'string', default: '10' },
      'no-ssl': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const tableName = values.table ?? 'apitrail_spans'
  const limit = Math.max(1, Math.min(100, Number(values.limit ?? '10')))
  const url = resolveUrl(values.url)
  if (!url) {
    console.error(red('error:'), 'no database URL.')
    process.exit(1)
  }

  const pool = openPool({ url, ssl: !values['no-ssl'] })
  const t = `"${tableName}"`

  try {
    const [total, byKind, last24, errors, slow, recent] = await Promise.all([
      pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${t}`),
      pool.query<{ kind: string; count: string }>(
        `SELECT kind, count(*)::text AS count FROM ${t} GROUP BY kind ORDER BY count DESC`,
      ),
      pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${t} WHERE created_at > now() - interval '24 hours'`,
      ),
      pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${t} WHERE status_code >= 400 AND created_at > now() - interval '24 hours'`,
      ),
      pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${t} WHERE duration_ms > 500 AND kind='SERVER' AND created_at > now() - interval '24 hours'`,
      ),
      pool.query<Row>(
        `SELECT created_at, trace_id, method, path, status_code, duration_ms, error_message
         FROM ${t}
         WHERE kind = 'SERVER'
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      ),
    ])

    console.log()
    console.log(bold('apitrail status'))
    console.log(dim('─────────────────────────────────────────────'))
    console.log(`${dim('table       :')} ${tableName}`)
    console.log(`${dim('total rows  :')} ${total.rows[0]?.count ?? '0'}`)
    console.log(`${dim('last 24h    :')} ${last24.rows[0]?.count ?? '0'}`)
    console.log(`${dim('errors 24h  :')} ${errors.rows[0]?.count ?? '0'}`)
    console.log(`${dim('slow 24h    :')} ${slow.rows[0]?.count ?? '0'} ${gray('(>500ms)')}`)
    console.log(
      `${dim('spans/kind  :')} ${byKind.rows.map((r) => `${r.kind}=${r.count}`).join(', ') || '—'}`,
    )
    console.log()

    if (recent.rows.length === 0) {
      console.log(dim('(no requests yet — hit some endpoints)'))
      return
    }

    console.log(bold(`recent ${recent.rows.length} requests:`))
    console.log(dim('─────────────────────────────────────────────'))
    for (const r of recent.rows) {
      const when = new Date(r.created_at).toISOString().slice(11, 19)
      const dur = fmtDuration(Number(r.duration_ms))
      const meth = (r.method ?? '—').padEnd(5)
      const path = (r.path ?? '').padEnd(30)
      const trace = gray(r.trace_id.slice(0, 8))
      const err = r.error_message ? red(` ⚠ ${r.error_message}`) : ''
      console.log(
        `${gray(when)}  ${trace}  ${meth} ${path} ${fmtStatus(r.status_code)} ${dur}${err}`,
      )
    }
    console.log()
  } finally {
    await pool.end()
  }
}
