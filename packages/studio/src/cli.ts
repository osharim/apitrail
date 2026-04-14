import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { startServer } from './server/index.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

const HELP = `
apitrail studio v${pkg.version} — standalone dashboard for apitrail

Usage:
  apitrail-studio [options]
  pnpm dlx @apitrail/studio [options]

Options:
  --db <url>            Postgres connection string (or APITRAIL_DATABASE_URL / DATABASE_URL)
  --port <n>            HTTP port (default: 4545)
  --host <addr>         Bind address (default: 127.0.0.1). Use 0.0.0.0 for LAN — REQUIRES --auth-basic.
  --table <name>        Table name (default: apitrail_spans)
  --auth-basic <u:p>    Enable HTTP Basic Auth with "username:password". REQUIRED if --host is non-loopback.
  --no-ssl              Disable SSL on the pg connection
  --no-open             Don't auto-open the browser
  --dev                 Development mode (adds CORS, skips UI serving)
  -v, --version         Print version
  -h, --help            Show this help

Environment:
  APITRAIL_DATABASE_URL     Preferred connection string
  DATABASE_URL              Fallback
  POSTGRES_URL              Fallback
  APITRAIL_STUDIO_AUTH      Fallback for --auth-basic (value format: "user:pass")
  NO_COLOR=1                Disable colors
`

const c = (open: number, close: number) => (s: string) => {
  if (process.env.NO_COLOR) return s
  if (!process.stdout.isTTY) return s
  return `\x1b[${open}m${s}\x1b[${close}m`
}
const bold = c(1, 22)
const dim = c(2, 22)
const violet = c(35, 39)
const green = c(32, 39)
const red = c(31, 39)
const yellow = c(33, 39)

function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host.startsWith('127.')
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      db: { type: 'string' },
      port: { type: 'string', default: '4545' },
      host: { type: 'string', default: '127.0.0.1' },
      table: { type: 'string', default: 'apitrail_spans' },
      'auth-basic': { type: 'string' },
      ssl: { type: 'boolean', default: true },
      'no-ssl': { type: 'boolean', default: false },
      open: { type: 'boolean', default: true },
      'no-open': { type: 'boolean', default: false },
      dev: { type: 'boolean', default: false },
      version: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  })

  if (values.help) {
    console.log(HELP)
    return
  }
  if (values.version) {
    console.log(pkg.version)
    return
  }

  const connectionString =
    values.db ??
    process.env.APITRAIL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL

  if (!connectionString) {
    console.error(red('error:'), 'no database URL.')
    console.error('Set APITRAIL_DATABASE_URL / DATABASE_URL, or pass --db.')
    process.exit(1)
  }

  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(red('error:'), `invalid port: ${values.port}`)
    process.exit(1)
  }

  const host = values.host ?? '127.0.0.1'
  const authBasic = values['auth-basic'] ?? process.env.APITRAIL_STUDIO_AUTH

  // ── Security guard: refuse to listen on a non-loopback interface without auth ──
  if (!isLoopback(host) && !authBasic) {
    console.error(red('error:'), `refusing to bind to ${host} without --auth-basic.`)
    console.error('  Binding to a non-loopback address makes your logs reachable over the network.')
    console.error(
      '  Pass --auth-basic user:pass (or APITRAIL_STUDIO_AUTH=user:pass), or use --host 127.0.0.1.',
    )
    process.exit(1)
  }

  if (authBasic && !/^[^:]+:.+$/.test(authBasic)) {
    console.error(red('error:'), '--auth-basic must be in the form "user:password".')
    process.exit(1)
  }

  const ssl = !values['no-ssl']
  const openBrowser = !values['no-open']

  try {
    const { url, stop } = await startServer({
      connectionString,
      port,
      host,
      tableName: values.table,
      ssl,
      authBasic,
      dev: values.dev,
    })

    console.log()
    console.log(`  ${violet('●')} ${bold('apitrail studio')} ${dim(`v${pkg.version}`)}`)
    console.log(`  ${green('→')} ${url}`)
    if (authBasic) console.log(`  ${dim('auth:')} basic (configured)`)
    if (!isLoopback(host)) {
      console.log(`  ${yellow('⚠')} bound to ${host} — ensure you have a reverse proxy with TLS.`)
    }
    console.log(`  ${dim('Press Ctrl+C to stop.')}`)
    console.log()

    if (openBrowser && !values.dev && isLoopback(host)) {
      try {
        const open = (await import('open')).default
        await open(url)
      } catch {
        // Non-fatal.
      }
    }

    const shutdown = async (): Promise<void> => {
      console.log(`\n${dim('shutting down…')}`)
      await stop()
      process.exit(0)
    }
    process.once('SIGINT', () => void shutdown())
    process.once('SIGTERM', () => void shutdown())
  } catch (err) {
    console.error(red('error:'), (err as Error).message)
    if (process.env.APITRAIL_DEBUG) console.error((err as Error).stack)
    process.exit(1)
  }
}

main()
