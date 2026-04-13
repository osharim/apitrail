import type { ResolvedConfig, SpanEntry } from './types.js'

/**
 * Decide whether to keep a span based on the configured sampling rules.
 * Only SERVER HTTP spans are subject to success/error/slow categorization;
 * other spans (INTERNAL/CLIENT/etc.) fall through to the success rate.
 */
export function shouldSample(entry: SpanEntry, config: ResolvedConfig): boolean {
  if (entry.kind !== 'SERVER' || entry.statusCode === undefined) {
    return sampleAt(config.sampling.success)
  }

  const isError = entry.statusCode >= 400
  const isSlow = entry.durationMs > config.slowMs
  const rate = isError
    ? config.sampling.error
    : isSlow
      ? config.sampling.slow
      : config.sampling.success

  return sampleAt(rate)
}

function sampleAt(rate: number): boolean {
  if (rate >= 1) return true
  if (rate <= 0) return false
  return Math.random() < rate
}
