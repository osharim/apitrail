import type { ResolvedConfig, SpanEntry } from './types.js'

/**
 * Decide whether to keep a span based on the configured sampling rules.
 * Only SERVER HTTP spans are subject to success/error/slow categorization;
 * all other spans fall through to the global `sampleRate`.
 */
export function shouldSample(entry: SpanEntry, config: ResolvedConfig): boolean {
  if (config.sampleRate < 1 && Math.random() > config.sampleRate) return false

  if (entry.kind !== 'SERVER' || entry.statusCode === undefined) return true

  const isError = entry.statusCode >= 400
  const isSlow = entry.durationMs > config.slowMs
  const rate = isError
    ? config.sampling.error
    : isSlow
      ? config.sampling.slow
      : config.sampling.success

  if (rate >= 1) return true
  if (rate <= 0) return false
  return Math.random() < rate
}
