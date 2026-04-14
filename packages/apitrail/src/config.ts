import { consoleAdapter } from './adapters/console.js'
import { DEFAULT_MASK_KEYS } from './mask.js'
import type { ApitrailConfig, ResolvedConfig } from './types.js'

export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'adapter'> = {
  serviceName: 'apitrail-app',
  skipPaths: [/^\/_next\//, /^\/favicon\.ico$/, '/api/health'],
  methods: null,
  statusCodes: null,
  slowMs: 500,
  sampling: { success: 1, error: 1, slow: 1 },
  captureHeaders: true,
  captureBodies: true,
  captureChildren: true,
  maxBodySize: 10_000,
  maskKeys: DEFAULT_MASK_KEYS,
  autoInstrument: true,
  otelInstrumentations: [],
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
  const { sampling, batch, ...rest } = config
  return {
    ...DEFAULT_CONFIG,
    ...rest,
    sampling: {
      success: sampling?.success ?? DEFAULT_CONFIG.sampling.success,
      error: sampling?.error ?? DEFAULT_CONFIG.sampling.error,
      slow: sampling?.slow ?? DEFAULT_CONFIG.sampling.slow,
    },
    maskKeys: config.maskKeys ?? DEFAULT_CONFIG.maskKeys,
    batch: { ...DEFAULT_CONFIG.batch, ...batch },
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
