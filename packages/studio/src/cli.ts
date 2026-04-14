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
  --db <url>        Postgres connection string (or APITRAIL_DATABASE_URL / DATABASE_URL)
  --port <n>        HTTP port (default: 4545)
  --host <addr>     Bind address (default: 127.0.0.1)
  --table <name>    Table name (default: apitrail_spans)
  --no-ssl          Disable SSL
  --no-open         Don't auto-open the browser
  --dev             Development mode (adds CORS, skips UI serving)
  -v, --version     Print version
  -h, --help        Show this help

Environment:
  APITRAIL_DATABASE_URL   Preferred
  DATABASE_URL            Fallback
  POSTGRES_URL            Fallback
  NO_COLOR=1              Disable colors
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

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      db: { type: 'string' },
      port: { type: 'string', default: '4545' },
      host: { type: 'string', default: '127.0.0.1' },
      table: { type: 'string', default: 'apitrail_spans' },
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
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(red('error:'), `invalid port: ${values.port}`)
    process.exit(1)
  }

  const ssl = !values['no-ssl']
  const openBrowser = !values['no-open']

  try {
    const { url, stop } = await startServer({
      connectionString,
      port,
      host: values.host ?? '127.0.0.1',
      tableName: values.table,
      ssl,
      dev: values.dev,
    })

    console.log()
    console.log(`  ${violet('●')} ${bold('apitrail studio')} ${dim(`v${pkg.version}`)}`)
    console.log(`  ${green('→')} ${url}`)
    console.log(`  ${dim('Press Ctrl+C to stop.')}`)
    console.log()

    if (openBrowser && !values.dev) {
      try {
        const open = (await import('open')).default
        await open(url)
      } catch {
        // Fails silently in CI/headless — user can still visit the URL.
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
