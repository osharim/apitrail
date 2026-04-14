import { useState } from 'react'
import { usePoll } from '../hooks/usePoll'
import { type ServerRequest, type SpansQuery, api } from '../lib/api'
import { durationTone, fmtDuration, fmtTime } from '../lib/format'
import { MethodBadge, StatusBadge } from './Badge'
import { Filters, type FiltersState } from './Filters'

function classToRange(cls: string): { min?: number; max?: number } {
  if (cls === '2xx') return { min: 200, max: 299 }
  if (cls === '3xx') return { min: 300, max: 399 }
  if (cls === '4xx') return { min: 400, max: 499 }
  if (cls === '5xx') return { min: 500, max: 599 }
  return {}
}

function buildQuery(f: FiltersState): SpansQuery {
  const { min, max } = classToRange(f.statusClass)
  return {
    limit: 100,
    method: f.method || undefined,
    minStatus: min,
    maxStatus: max,
    pathLike: f.path.trim() || undefined,
  }
}

interface Props {
  selected: string | null
  onSelect: (traceId: string) => void
}

export function RequestsTable({ selected, onSelect }: Props) {
  const [filters, setFilters] = useState<FiltersState>({ method: '', statusClass: '', path: '' })
  const query = buildQuery(filters)
  const filtersKey = `${filters.method}|${filters.statusClass}|${filters.path}`
  const { data, error, loading, refresh } = usePoll<ServerRequest[]>(
    () => api.spans(query),
    5_000,
    filtersKey,
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Filters value={filters} onChange={setFilters} onRefresh={refresh} />
        <div className="text-xs text-neutral-500 tabular">
          {loading ? 'loading…' : `${data?.length ?? 0} requests`}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
        {error ? (
          <div className="p-4 text-sm text-rose-300">Failed to load: {error.message}</div>
        ) : !data || data.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            {loading ? 'Loading…' : 'No requests match these filters.'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left text-[10px] uppercase tracking-[0.1em] text-neutral-500">
                <th className="w-20 px-3 py-2 font-medium">Time</th>
                <th className="w-20 px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Path</th>
                <th className="w-16 px-3 py-2 font-medium">Status</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Duration</th>
                <th className="w-24 px-3 py-2 font-medium">Trace</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const isSelected = selected === r.trace_id
                const activate = () => onSelect(r.trace_id)
                return (
                  <tr
                    key={r.span_id}
                    tabIndex={0}
                    onClick={activate}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        activate()
                      }
                    }}
                    className={`cursor-pointer border-b border-neutral-900 outline-none transition-colors last:border-b-0 hover:bg-neutral-800/40 focus-visible:bg-neutral-800/60 focus-visible:ring-1 focus-visible:ring-violet-500/50 ${
                      isSelected ? 'bg-neutral-800/60' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-neutral-500 tabular">
                      {fmtTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <MethodBadge method={r.method} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-neutral-200">{r.path}</div>
                      {r.error_message ? (
                        <div className="mt-0.5 truncate text-[11px] text-rose-400">
                          ⚠ {r.error_message}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge code={r.status_code} />
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono tabular ${durationTone(Number(r.duration_ms))}`}
                    >
                      {fmtDuration(Number(r.duration_ms))}
                    </td>
                    <td className="px-3 py-2 font-mono text-neutral-500">
                      {r.trace_id.slice(0, 8)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
