import { describe, expect, it } from 'vitest'
import { loadAutoInstrumentations } from '../src/auto-instrument.js'

describe('loadAutoInstrumentations', () => {
  it('returns empty when no OTEL packages are installed', async () => {
    // In our monorepo, no @opentelemetry/instrumentation-* packages are installed
    // (we list them in INTEGRATING.md as *peer-level* add-ons the user installs).
    const result = await loadAutoInstrumentations(false)
    expect(result.instrumentations).toEqual([])
    expect(result.enabled).toEqual([])
  })

  it('does not throw on any candidate module failure', async () => {
    // The function must never propagate import errors; missing packages
    // are the expected case for most users' stacks.
    await expect(loadAutoInstrumentations(false)).resolves.toEqual(
      expect.objectContaining({ instrumentations: expect.any(Array) }),
    )
  })
})
