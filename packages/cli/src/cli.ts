import { drop } from './commands/drop.js'
import { init } from './commands/init.js'
import { install } from './commands/install.js'
import { status } from './commands/status.js'
import { bold, cyan, dim, red } from './utils/colors.js'

// Replaced at build time by tsup `define`.
declare const __APITRAIL_VERSION__: string

const HELP = `
${bold('apitrail')} ${dim(`v${__APITRAIL_VERSION__}`)} — drop-in request logging for Next.js.

${bold('Commands:')}
  ${cyan('install')}   ${dim('# recommended')}  One-command setup wizard (installs deps, writes instrumentation.ts, creates the table)
  ${cyan('init')}                    Create just the database table + indexes
  ${cyan('status')}                  Show recent activity and row counts
  ${cyan('drop')}                    Drop the apitrail table (destructive, requires --yes)

${bold('Quick start:')}
  ${dim('#')} In an existing Next.js 15+ project:
  pnpm dlx apitrail install

${bold('Examples:')}
  apitrail install                  ${dim('# interactive wizard')}
  apitrail install --yes            ${dim('# accept defaults, use env DATABASE_URL')}
  apitrail install --with-dashboard ${dim('# + scaffold /apitrail page')}
  apitrail init                     ${dim('# schema only')}
  apitrail status --limit 20        ${dim('# show recent requests')}
  apitrail drop --yes               ${dim('# destructive')}

${bold('Environment:')}
  APITRAIL_DATABASE_URL   Connection string (preferred)
  DATABASE_URL            Fallback
  POSTGRES_URL            Fallback
  NO_COLOR=1              Disable colored output
`

const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = {
  install,
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
    console.log(__APITRAIL_VERSION__)
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
