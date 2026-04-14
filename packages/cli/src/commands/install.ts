import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createSchemaSQL } from '@apitrail/postgres/schema'
import { bold, cyan, dim, green, yellow } from '../utils/colors.js'
import { openPool } from '../utils/db.js'
import { detectProject, runInstall } from '../utils/project.js'
import { confirm, input, log } from '../utils/prompts.js'

const HELP = `
${bold('apitrail install')} — one-command setup for a Next.js project

Walks you through:
  1. Installs \`apitrail\` + \`@apitrail/postgres\` (+ optional dashboard)
  2. Creates an edge-safe \`instrumentation.ts\`
  3. Creates the \`apitrail_spans\` table in your database
  4. Optionally scaffolds the embedded dashboard at \`/apitrail\`

${bold('Usage:')}
  apitrail install [options]

${bold('Options:')}
  --yes              Accept all defaults (no prompts)
  --with-dashboard   Scaffold the embedded Next.js dashboard too
  --with-studio      Print the command to launch the standalone studio
  --db <url>         Skip prompts and use this connection string
  --table <name>     Table name (default: apitrail_spans)
  --no-install       Skip running the package manager
  --no-migrate       Don't create the schema
  -h, --help         Show this help
`

export async function install(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      yes: { type: 'boolean', default: false },
      'with-dashboard': { type: 'boolean', default: false },
      'with-studio': { type: 'boolean', default: false },
      db: { type: 'string' },
      table: { type: 'string', default: 'apitrail_spans' },
      install: { type: 'boolean', default: true },
      'no-install': { type: 'boolean', default: false },
      migrate: { type: 'boolean', default: true },
      'no-migrate': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  console.log(`\n${bold(cyan('●'))} ${bold('apitrail install')}\n`)
  console.log(dim('  One-command setup — installs, configures, and bootstraps your logging.\n'))

  // ── 1. Detect project ─────────────────────────────────────────────────
  log.step('Detecting your project')
  const project = detectProject()
  log.done(`package manager: ${bold(project.packageManager)}`)
  log.done(
    project.nextVersion
      ? `next.js detected: ${bold(project.nextVersion)}`
      : `${yellow('no Next.js found — apitrail is designed for Next.js 15+')}`,
  )
  log.done(`typescript: ${project.typescript ? 'yes' : dim('no')}`)
  if (project.hasInstrumentationTs) {
    log.warn(`${yellow('existing instrumentation file detected')} — will back up before writing`)
  }

  // ── 2. Ask for the connection string ─────────────────────────────────
  log.step('Database connection')
  let databaseUrl = values.db ?? project.databaseUrl
  if (databaseUrl) {
    log.done(`found: ${redact(databaseUrl)}`)
  } else if (values.yes) {
    log.fail('no DATABASE_URL found and --yes was passed. Aborting.')
    process.exit(1)
  } else {
    databaseUrl = await input('Postgres connection string', {
      placeholder: 'postgres://user:pass@host:5432/db',
    })
    if (!databaseUrl) {
      log.fail('no connection string provided. Aborting.')
      process.exit(1)
    }
  }

  // ── 3. Confirm features ───────────────────────────────────────────────
  let withDashboard = values['with-dashboard']
  if (!values.yes && !withDashboard) {
    withDashboard = await confirm(
      'Install @apitrail/dashboard (embed a dashboard at /apitrail)?',
      false,
    )
  }

  // ── 3b. Detect instrumentations for user's stack ──────────────────────
  const suggestions = suggestInstrumentations(project.deps)
  const chosenInstrumentations: string[] = []

  if (suggestions.length > 0) {
    log.step(`Detected ${suggestions.length} integration(s) in your project`)
    for (const s of suggestions) {
      const wantIt = values.yes ? true : await confirm(`Enable ${s.label}?`, true)
      if (wantIt) chosenInstrumentations.push(s.install)
    }
  }

  // ── 4. Install packages ───────────────────────────────────────────────
  if (values.install && !values['no-install']) {
    log.step('Installing packages')
    const deps = ['apitrail@alpha', '@apitrail/postgres@alpha', 'pg']
    if (withDashboard) deps.push('@apitrail/dashboard@alpha', 'server-only')
    for (const pkg of chosenInstrumentations) deps.push(pkg)
    const devDeps = ['@types/pg']
    try {
      runInstall(project.packageManager, deps, { cwd: project.root })
      runInstall(project.packageManager, devDeps, { dev: true, cwd: project.root })
      log.done(`installed ${deps.length} runtime + ${devDeps.length} dev packages`)
      if (chosenInstrumentations.length > 0) {
        log.done(
          `auto-instrument will pick up: ${chosenInstrumentations.map((p) => p.replace(/^@opentelemetry\/instrumentation-/, '')).join(', ')}`,
        )
      }
    } catch (err) {
      log.fail(`install failed: ${(err as Error).message}`)
      process.exit(1)
    }
  } else {
    log.skip('skipped install (--no-install)')
  }

  // ── 5. Write instrumentation.ts ───────────────────────────────────────
  log.step('Writing instrumentation.ts')
  const instrumentationPath = join(
    project.root,
    project.typescript ? 'instrumentation.ts' : 'instrumentation.js',
  )
  if (existsSync(instrumentationPath)) {
    const backup = `${instrumentationPath}.backup-${Date.now()}`
    writeFileSync(backup, readFileSync(instrumentationPath))
    log.warn(`backed up existing file → ${relative(project.root, backup)}`)
  }
  writeFileSync(instrumentationPath, renderInstrumentation(project.typescript, values.table))
  log.done(`wrote ${relative(project.root, instrumentationPath)}`)

  // ── 6. Add DATABASE_URL to .env.local if missing ──────────────────────
  if (databaseUrl) {
    const envPath = join(project.root, '.env.local')
    const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
    if (!/^\s*DATABASE_URL\s*=/m.test(existing)) {
      const newline = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
      writeFileSync(envPath, `${existing}${newline}DATABASE_URL=${JSON.stringify(databaseUrl)}\n`)
      log.done('added DATABASE_URL to .env.local')
    } else {
      log.skip('.env.local already has DATABASE_URL')
    }
  }

  // ── 7. Scaffold embedded dashboard route ──────────────────────────────
  if (withDashboard) {
    const appDir = existsSync(join(project.root, 'src/app'))
      ? join(project.root, 'src/app')
      : join(project.root, 'app')
    if (existsSync(appDir)) {
      const dashDir = join(appDir, 'apitrail', '[[...path]]')
      const dashFile = join(dashDir, project.typescript ? 'page.tsx' : 'page.jsx')
      if (!existsSync(dashFile)) {
        mkdirSync(dashDir, { recursive: true })
        writeFileSync(dashFile, renderDashboardPage(project.typescript))
        log.done(`scaffolded ${relative(project.root, dashFile)}`)
      } else {
        log.skip(`dashboard page already exists at ${relative(project.root, dashFile)}`)
      }
    } else {
      log.warn('app/ directory not found — skipped dashboard page')
    }
  }

  // ── 8. Run schema migration ───────────────────────────────────────────
  if (values.migrate && !values['no-migrate'] && databaseUrl) {
    log.step('Creating database schema')
    try {
      const pool = openPool({ url: databaseUrl, ssl: true })
      await pool.query(createSchemaSQL(values.table))
      await pool.end()
      log.done(`table ${bold(values.table ?? 'apitrail_spans')} ready`)
    } catch (err) {
      log.fail(`migration failed: ${(err as Error).message}`)
      log.warn('you can retry with: apitrail init')
    }
  } else {
    log.skip('skipped schema migration')
  }

  // ── 9. Next steps ─────────────────────────────────────────────────────
  console.log()
  console.log(`  ${green('✓')} ${bold('apitrail installed.')}`)
  console.log()
  console.log(`  ${bold('Next:')}`)
  console.log(`    ${dim('1.')} Start your app:    ${cyan(`${project.packageManager} dev`)}`)
  console.log(
    `    ${dim('2.')} Hit any endpoint → logs flow to ${bold(values.table ?? 'apitrail_spans')}`,
  )
  if (withDashboard) {
    console.log(`    ${dim('3.')} Open the dashboard: ${cyan('http://localhost:3000/apitrail')}`)
  } else {
    console.log(
      `    ${dim('3.')} Explore with studio: ${cyan(`${project.packageManager} dlx @apitrail/studio`)}`,
    )
  }
  console.log()
  console.log(`  ${dim('docs:')} https://github.com/osharim/apitrail/blob/main/INTEGRATING.md`)
  console.log()
}

function renderInstrumentation(ts: boolean, tableName: string | undefined): string {
  const t =
    tableName && tableName !== 'apitrail_spans' ? `    tableName: '${tableName}',\n      ` : ''
  const fileHeader = ts
    ? `/**
 * apitrail — auto-generated by \`apitrail install\`.
 * Edit freely. See https://github.com/osharim/apitrail/blob/main/INTEGRATING.md
 */
`
    : '// apitrail — auto-generated by `apitrail install`.\n'

  return `${fileHeader}export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { DEFAULT_MASK_KEYS, defineConfig, register: apitrailRegister } = await import('apitrail')
  const { postgresAdapter } = await import('@apitrail/postgres')

  await apitrailRegister(
    defineConfig({
      adapter: postgresAdapter({
        connectionString: process.env.DATABASE_URL,
        ${t}poolConfig: {
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        },
      }),
      skipPaths: [/^\\/_next\\//, /^\\/favicon\\./, '/api/health'],
      maskKeys: [...DEFAULT_MASK_KEYS],
      sampling: { success: 1, error: 1, slow: 1 },
    }),
  )
}
`
}

function renderDashboardPage(ts: boolean): string {
  if (!ts) {
    return `import { Dashboard } from '@apitrail/dashboard'
import '@apitrail/dashboard/styles.css'

export const dynamic = 'force-dynamic'

export default async function Page({ params }) {
  return <Dashboard params={params} poolConfig={{ ssl: { rejectUnauthorized: false } }} />
}
`
  }
  return `import { Dashboard } from '@apitrail/dashboard'
import '@apitrail/dashboard/styles.css'

export const dynamic = 'force-dynamic'

export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>
}) {
  return <Dashboard params={params} poolConfig={{ ssl: { rejectUnauthorized: false } }} />
}
`
}

function redact(url: string): string {
  // "postgres://user:pass@host" → "postgres://user:***@host"
  return url.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2')
}

function relative(root: string, file: string): string {
  return file.startsWith(root) ? file.slice(root.length + 1) : file
}
