import { consoleAdapter } from './adapters/console.js'
import type { ApitrailConfig, ResolvedConfig } from './types.js'

export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'adapter'> = {
  serviceName: 'apitrail-app',
  skipPaths: [/^\/_next\//, /^\/favicon\.ico$/, '/api/health'],
  methods: null,
  statusCodes: null,
  slowMs: 500,
  sampleRate: 1,
  batch: {
    maxSize: 50,
    intervalMs: 5000,
  },
  debug: false,
}

export function defineConfig(config: ApitrailConfig): ApitrailConfig {
  return config
}

export function resolveConfig(config: ApitrailConfig = {}): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    batch: { ...DEFAULT_CONFIG.batch, ...config.batch },
    adapter: config.adapter ?? consoleAdapter(),
  }
}

export function shouldSkipPath(path: string, skipPaths: ResolvedConfig['skipPaths']): boolean {
  for (const rule of skipPaths) {
    if (typeof rule === 'string') {
      if (path === rule || path.startsWith(`${rule}/`)) return true
    } else if (rule.test(path)) {
      return true
    }
  }
  return false
}
