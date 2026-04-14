/**
 * Best-effort auto-loader for the `@opentelemetry/instrumentation-*`
 * ecosystem. Looks for each known package in the user's node_modules and,
 * if present, constructs an instance with default options.
 *
 * Philosophy:
 *  - Install the package → it works. No config file change required.
 *  - Package not installed? We skip silently — no warnings, no noise.
 *  - User always has the escape hatch: pass `autoInstrument: false` and
 *    `otelInstrumentations: [...]` manually if they need custom options.
 *
 * This matches the UX of Sentry's `integrations` auto-detection and
 * dd-trace's zero-config posture.
 */

interface Candidate {
  module: string
  className: string
  label: string
}

/** Ordered by install-frequency so startup is fast for common stacks. */
const CANDIDATES: readonly Candidate[] = [
  { module: '@opentelemetry/instrumentation-pg', className: 'PgInstrumentation', label: 'pg' },
  {
    module: '@opentelemetry/instrumentation-undici',
    className: 'UndiciInstrumentation',
    label: 'fetch/undici',
  },
  {
    module: '@opentelemetry/instrumentation-fetch',
    className: 'FetchInstrumentation',
    label: 'fetch',
  },
  {
    module: '@opentelemetry/instrumentation-redis-4',
    className: 'RedisInstrumentation',
    label: 'redis-4',
  },
  {
    module: '@opentelemetry/instrumentation-ioredis',
    className: 'IORedisInstrumentation',
    label: 'ioredis',
  },
  {
    module: '@opentelemetry/instrumentation-mongodb',
    className: 'MongoDBInstrumentation',
    label: 'mongodb',
  },
  {
    module: '@opentelemetry/instrumentation-mysql2',
    className: 'MySQL2Instrumentation',
    label: 'mysql2',
  },
  {
    module: '@opentelemetry/instrumentation-mysql',
    className: 'MySQLInstrumentation',
    label: 'mysql',
  },
  {
    module: '@opentelemetry/instrumentation-aws-sdk',
    className: 'AwsInstrumentation',
    label: 'aws-sdk',
  },
  {
    module: '@opentelemetry/instrumentation-graphql',
    className: 'GraphQLInstrumentation',
    label: 'graphql',
  },
  {
    module: '@opentelemetry/instrumentation-kafkajs',
    className: 'KafkaJsInstrumentation',
    label: 'kafkajs',
  },
]

export interface AutoInstrumentResult {
  /** OTEL instrumentation instances ready to pass to `@vercel/otel`. */
  instrumentations: unknown[]
  /** Human-readable labels of what we enabled. */
  enabled: string[]
}

export async function loadAutoInstrumentations(debug = false): Promise<AutoInstrumentResult> {
  const instrumentations: unknown[] = []
  const enabled: string[] = []

  // Loaded in parallel — each `import()` resolves or rejects independently,
  // so N parallel failures take the same time as one.
  await Promise.all(
    CANDIDATES.map(async ({ module, className, label }) => {
      try {
        const mod = (await import(module)) as Record<string, unknown>
        const Ctor = mod[className] as (new () => unknown) | undefined
        if (typeof Ctor !== 'function') return
        instrumentations.push(new Ctor())
        enabled.push(label)
      } catch (err) {
        if (debug && isRealError(err)) {
          // Real error (syntax, version mismatch) — not just a missing package
          console.warn(`[apitrail] auto-instrument ${label} failed:`, err)
        }
      }
    }),
  )

  return { instrumentations, enabled }
}

function isRealError(err: unknown): boolean {
  // Node's missing-package errors have code MODULE_NOT_FOUND / ERR_MODULE_NOT_FOUND.
  if (!err || typeof err !== 'object') return true
  const code = (err as { code?: string }).code
  return code !== 'MODULE_NOT_FOUND' && code !== 'ERR_MODULE_NOT_FOUND'
}
