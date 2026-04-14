import { useState } from 'react'
import { Overview } from './components/Overview'
import { RequestsTable } from './components/RequestsTable'
import { TraceDetail } from './components/TraceDetail'

export function App() {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
            </div>
            <span className="text-sm font-semibold tracking-tight">apitrail studio</span>
            <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              alpha
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <a
              href="https://github.com/osharim/apitrail"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-neutral-300"
            >
              github
            </a>
            <a
              href="https://github.com/osharim/apitrail/blob/main/INTEGRATING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-neutral-300"
            >
              docs
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-6 py-5">
        <Overview />
        <RequestsTable selected={selected} onSelect={setSelected} />
      </main>

      <TraceDetail traceId={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
