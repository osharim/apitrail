import { parseArgs } from 'node:util'
import { dropSchemaSQL } from '@apitrail/postgres/schema'
import { bold, dim, green, red } from '../utils/colors.js'
import { openPool, resolveUrl } from '../utils/db.js'

const HELP = `
${bold('apitrail drop')} — drop the apitrail table (${red('destructive')})

${bold('Usage:')}
  apitrail drop --yes [options]

${bold('Options:')}
  --url <url>       Postgres connection string
  --table <name>    Table name (default: apitrail_spans)
  --yes             Required — confirms you mean it
  --no-ssl          Disable SSL
  -h, --help        Show this help
`

export async function drop(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string' },
      table: { type: 'string', default: 'apitrail_spans' },
      yes: { type: 'boolean', default: false },
      'no-ssl': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const tableName = values.table ?? 'apitrail_spans'

  if (!values.yes) {
    console.error(red('error:'), 'this is destructive. Pass --yes to confirm.')
    console.error(dim(`       Would run: ${dropSchemaSQL(tableName)}`))
    process.exit(1)
  }

  const url = resolveUrl(values.url)
  if (!url) {
    console.error(red('error:'), 'no database URL.')
    process.exit(1)
  }

  const pool = openPool({ url, ssl: !values['no-ssl'] })
  try {
    await pool.query(dropSchemaSQL(tableName))
    console.log(green('✓'), `dropped ${tableName}`)
  } finally {
    await pool.end()
  }
}
