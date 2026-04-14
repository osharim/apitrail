import { useEffect, useRef, useState } from 'react'

/**
 * Polls `fetcher` on an interval. Re-runs the effect when `depsKey` changes
 * (a serializable string the caller derives from its own state). We don't
 * track `fetcher` directly — callers usually create a fresh closure every
 * render, which would thrash the polling loop.
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs = 5000,
  depsKey = '',
): {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  refresh: () => void
} {
  const [data, setData] = useState<T | undefined>()
  const [error, setError] = useState<Error | undefined>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const mountedRef = useRef(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick forces refresh(); depsKey triggers refetch on filter changes.
  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    const run = async (): Promise<void> => {
      try {
        const d = await fetcherRef.current()
        if (cancelled || !mountedRef.current) return
        setData(d)
        setError(undefined)
      } catch (err) {
        if (cancelled || !mountedRef.current) return
        setError(err as Error)
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    run()
    const timer = setInterval(run, intervalMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: tick triggers refresh(); depsKey collapses caller-supplied state.
  }, [tick, intervalMs, depsKey])

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  return { data, error, loading, refresh: () => setTick((t) => t + 1) }
}
