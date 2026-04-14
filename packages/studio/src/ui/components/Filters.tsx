import type { ChangeEvent } from 'react'

export interface FiltersState {
  method: string
  statusClass: string
  path: string
}

interface Props {
  value: FiltersState
  onChange: (next: FiltersState) => void
  onRefresh: () => void
}

const METHODS = ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const STATUS_CLASSES = [
  { value: '', label: 'Any' },
  { value: '2xx', label: '2xx' },
  { value: '3xx', label: '3xx' },
  { value: '4xx', label: '4xx' },
  { value: '5xx', label: '5xx' },
]

export function Filters({ value, onChange, onRefresh }: Props) {
  const update =
    (key: keyof FiltersState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onChange({ ...value, [key]: e.target.value })
    }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="h-8 rounded-md border border-neutral-800 bg-neutral-900 px-2 text-xs text-neutral-200 focus:border-neutral-600 focus:outline-none"
        value={value.method}
        onChange={update('method')}
        aria-label="Method"
      >
        {METHODS.map((m) => (
          <option key={m || 'any'} value={m}>
            {m || 'Any method'}
          </option>
        ))}
      </select>

      <select
        className="h-8 rounded-md border border-neutral-800 bg-neutral-900 px-2 text-xs text-neutral-200 focus:border-neutral-600 focus:outline-none"
        value={value.statusClass}
        onChange={update('statusClass')}
        aria-label="Status class"
      >
        {STATUS_CLASSES.map((c) => (
          <option key={c.value || 'any'} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      <input
        type="search"
        placeholder="Path contains…"
        className="h-8 w-48 rounded-md border border-neutral-800 bg-neutral-900 px-2 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
        value={value.path}
        onChange={update('path')}
      />

      <button
        type="button"
        onClick={onRefresh}
        className="h-8 rounded-md border border-neutral-800 bg-neutral-900 px-3 text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
      >
        Refresh
      </button>
    </div>
  )
}
