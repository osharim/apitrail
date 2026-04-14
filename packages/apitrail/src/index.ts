export { register } from './register.js'
export { defineConfig, resolveConfig } from './config.js'
export { consoleAdapter } from './adapters/console.js'
export {
  DEFAULT_MASK_KEYS,
  MASKED_VALUE,
  maskHeaders,
  maskJsonString,
  maskObject,
  maskQueryString,
  splitAndMaskPath,
  truncate,
} from './mask.js'
export type {
  ApitrailConfig,
  ResolvedConfig,
  SamplingConfig,
  SpanEntry,
  SpanKind,
  SpanStatus,
  StorageAdapter,
} from './types.js'
