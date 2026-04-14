import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface ProjectDetection {
  root: string
  packageManager: PackageManager
  nextVersion: string | undefined
  typescript: boolean
  hasInstrumentationTs: boolean
  hasAppRouter: boolean
  hasEnvLocal: boolean
  databaseUrl: string | undefined
  /** Runtime + dev deps detected in the user's package.json. */
  deps: readonly string[]
}

/**
 * Map of user-package → recommended OTEL instrumentation. When `apitrail
 * install` sees any of these in the user's package.json, it offers to
 * install the matching instrumentation so DB queries and outgoing calls
 * appear in the waterfall.
 */
export interface InstrumentationSuggestion {
  trigger: readonly string[]
  install: string
  label: string
}

export const INSTRUMENTATION_CATALOG: readonly InstrumentationSuggestion[] = [
  {
    trigger: ['pg', 'drizzle-orm', 'postgres', 'pg-promise', 'kysely'],
    install: '@opentelemetry/instrumentation-pg',
    label: 'pg — capture every Postgres / Drizzle / Kysely query with timing',
  },
  {
    trigger: ['undici'],
    install: '@opentelemetry/instrumentation-undici',
    label: 'undici — capture outgoing fetch() calls',
  },
  {
    trigger: ['ioredis'],
    install: '@opentelemetry/instrumentation-ioredis',
    label: 'ioredis — capture Redis commands',
  },
  {
    trigger: ['redis'],
    install: '@opentelemetry/instrumentation-redis-4',
    label: 'redis — capture Redis commands',
  },
  {
    trigger: ['mongodb', 'mongoose'],
    install: '@opentelemetry/instrumentation-mongodb',
    label: 'mongodb — capture MongoDB operations',
  },
  {
    trigger: ['mysql2'],
    install: '@opentelemetry/instrumentation-mysql2',
    label: 'mysql2 — capture MySQL queries',
  },
  {
    trigger: ['mysql'],
    install: '@opentelemetry/instrumentation-mysql',
    label: 'mysql — capture MySQL queries',
  },
  {
    trigger: ['aws-sdk', '@aws-sdk/client-s3', '@aws-sdk/client-dynamodb', '@aws-sdk/client-sqs'],
    install: '@opentelemetry/instrumentation-aws-sdk',
    label: 'aws-sdk — capture S3 / DynamoDB / SQS / any AWS call',
  },
  {
    trigger: ['graphql'],
    install: '@opentelemetry/instrumentation-graphql',
    label: 'graphql — capture GraphQL resolver timings',
  },
]

export function suggestInstrumentations(
  deps: readonly string[],
): readonly InstrumentationSuggestion[] {
  const depsSet = new Set(deps)
  return INSTRUMENTATION_CATALOG.filter((i) => i.trigger.some((t) => depsSet.has(t)))
}

export function detectProject(cwd: string = process.cwd()): ProjectDetection {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error(
      `No package.json found in ${cwd}. Run "apitrail install" from the root of a Next.js project.`,
    )
  }

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch {
    throw new Error(`Could not parse ${pkgPath}.`)
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  const nextVersion = allDeps.next

  return {
    root: cwd,
    packageManager: detectPackageManager(cwd),
    nextVersion,
    typescript: existsSync(join(cwd, 'tsconfig.json')),
    hasInstrumentationTs:
      existsSync(join(cwd, 'instrumentation.ts')) || existsSync(join(cwd, 'instrumentation.js')),
    hasAppRouter: existsSync(join(cwd, 'app')) || existsSync(join(cwd, 'src/app')),
    hasEnvLocal: existsSync(join(cwd, '.env.local')) || existsSync(join(cwd, '.env')),
    databaseUrl: readDatabaseUrl(cwd),
    deps: Object.keys(allDeps),
  }
}

function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  // Fall through to userAgent sniffing (set when invoked via `pnpm dlx` / `npx` / `bunx`)
  const ua = process.env.npm_config_user_agent ?? ''
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('bun')) return 'bun'
  if (ua.startsWith('yarn')) return 'yarn'
  return 'npm'
}

function readDatabaseUrl(cwd: string): string | undefined {
  // 1. Live process env
  const env =
    process.env.APITRAIL_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (env) return env

  // 2. Parse .env / .env.local on best-effort basis (no dotenv dep).
  for (const file of ['.env.local', '.env', '.env.development']) {
    const path = join(cwd, file)
    if (!existsSync(path)) continue
    const content = readFileSync(path, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*(DATABASE_URL|APITRAIL_DATABASE_URL|POSTGRES_URL)\s*=\s*(.+)$/)
      if (m?.[2]) {
        return stripQuotes(m[2].trim())
      }
    }
  }
  return undefined
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

const INSTALL_COMMANDS: Record<PackageManager, (deps: string[], dev: boolean) => string[]> = {
  pnpm: (deps, dev) => ['add', ...(dev ? ['-D'] : []), ...deps],
  npm: (deps, dev) => ['install', ...(dev ? ['-D'] : []), ...deps],
  yarn: (deps, dev) => ['add', ...(dev ? ['-D'] : []), ...deps],
  bun: (deps, dev) => ['add', ...(dev ? ['-d'] : []), ...deps],
}

export function runInstall(
  pm: PackageManager,
  deps: string[],
  opts: { dev?: boolean; cwd: string } = { cwd: process.cwd() },
): void {
  if (deps.length === 0) return
  const args = INSTALL_COMMANDS[pm](deps, opts.dev ?? false)
  execFileSync(pm, args, { cwd: opts.cwd, stdio: 'inherit' })
}
