import { drop } from './commands/drop.js'
import { init } from './commands/init.js'
import { status } from './commands/status.js'
import { bold, cyan, dim, red } from './utils/colors.js'

const VERSION = '0.1.0'

const HELP = `
${bold('apitrail')} ${dim(`v${VERSION}`)} — the API logger for Next.js.

${bold('Commands:')}
  ${cyan('init')}      Create the apitrail table + indexes in your database
  ${cyan('status')}    Show recent activity and row counts
  ${cyan('drop')}      Drop the apitrail table (destructive, requires --yes)

${bold('Examples:')}
  apitrail init
  apitrail init --url postgres://… --table my_logs
  apitrail init --force           ${dim('# drop + recreate')}
  apitrail init --print           ${dim('# print SQL only')}
  apitrail status --limit 20
  apitrail drop --yes

${bold('Environment:')}
  APITRAIL_DATABASE_URL   Connection string (preferred)
  DATABASE_URL            Fallback
  POSTGRES_URL            Fallback
  NO_COLOR=1              Disable colored output
`

const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = {
  init,
  status,
  drop,
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2)

  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    console.log(HELP)
    return
  }

  if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
    console.log(VERSION)
    return
  }

  const handler = COMMANDS[cmd]
  if (!handler) {
    console.error(red('error:'), `unknown command: ${cmd}`)
    console.error(HELP)
    process.exit(1)
  }

  await handler(rest)
}

main().catch((err) => {
  if (err instanceof Error) {
    console.error(red('error:'), err.message)
    if (process.env.APITRAIL_DEBUG) console.error(err.stack)
  } else {
    console.error(err)
  }
  process.exit(1)
})
