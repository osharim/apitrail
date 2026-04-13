import { parseArgs } from 'node:util'
import { createSchemaSQL, dropSchemaSQL } from '@apitrail/postgres/schema'
import { bold, dim, green, red, yellow } from '../utils/colors.js'
import { openPool, resolveUrl } from '../utils/db.js'

const HELP = `
${bold('apitrail init')} — create the apitrail schema in your database

${bold('Usage:')}
  apitrail init [options]

${bold('Options:')}
  --url <url>       Postgres connection string (or APITRAIL_DATABASE_URL / DATABASE_URL)
  --table <name>    Table name (default: apitrail_spans)
  --force           Drop the table first, then recreate (${red('destructive')})
  --print           Print the SQL but don't execute it
  --no-ssl          Disable SSL (default: enabled, accept self-signed)
  -h, --help        Show this help
`

export async function init(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string' },
      table: { type: 'string', default: 'apitrail_spans' },
      force: { type: 'boolean', default: false },
      print: { type: 'boolean', default: false },
      ssl: { type: 'boolean', default: true },
      'no-ssl': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const tableName = values.table ?? 'apitrail_spans'
  const createSql = createSchemaSQL(tableName)

  if (values.print) {
    if (values.force) console.log(`${dropSchemaSQL(tableName)}\n`)
    console.log(createSql)
    return
  }

  const url = resolveUrl(values.url)
  if (!url) {
    console.error(red('error:'), 'no database URL.')
    console.error('Set APITRAIL_DATABASE_URL / DATABASE_URL / POSTGRES_URL, or pass --url')
    process.exit(1)
  }

  const ssl = !values['no-ssl']
  const pool = openPool({ url, ssl })

  try {
    if (values.force) {
      console.log(dim('↳ dropping'), yellow(tableName), dim('(CASCADE)...'))
      await pool.query(dropSchemaSQL(tableName))
    }

    console.log(dim('↳ creating schema for'), yellow(tableName), dim('...'))
    await pool.query(createSql)

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text as count FROM "${tableName}"`,
    )
    const count = rows[0]?.count ?? '0'

    console.log()
    console.log(green('✓'), bold('apitrail ready.'))
    console.log(`  table  : ${tableName}`)
    console.log(`  rows   : ${count}`)
    console.log()
    console.log(dim('Next:'))
    console.log(dim('  Add this to your instrumentation.ts:'))
    console.log(dim(`
    import { defineConfig, register as apitrailRegister } from 'apitrail'
    import { postgresAdapter } from '@apitrail/postgres'

    const config = defineConfig({
      adapter: postgresAdapter({
        connectionString: process.env.DATABASE_URL,
        poolConfig: { ssl: { rejectUnauthorized: false } },
      }),
    })

    export const register = () => apitrailRegister(config)
`))
  } finally {
    await pool.end()
  }
}
