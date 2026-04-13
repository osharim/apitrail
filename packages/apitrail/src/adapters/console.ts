import type { LogEntry, StorageAdapter } from '../types.js'

export interface ConsoleAdapterOptions {
  pretty?: boolean
  color?: boolean
}

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

function colorForStatus(status: number | undefined, color: boolean): string {
  if (!color || status === undefined) return ''
  if (status >= 500) return COLORS.red
  if (status >= 400) return COLORS.yellow
  if (status >= 300) return COLORS.cyan
  if (status >= 200) return COLORS.green
  return COLORS.dim
}

function formatDuration(ms: number, color: boolean): string {
  const fixed = ms < 10 ? ms.toFixed(1) : ms.toFixed(0)
  if (!color) return `${fixed}ms`
  if (ms > 1000) return `${COLORS.red}${fixed}ms${COLORS.reset}`
  if (ms > 500) return `${COLORS.yellow}${fixed}ms${COLORS.reset}`
  return `${COLORS.dim}${fixed}ms${COLORS.reset}`
}

function isTTY(): boolean {
  const proc = globalThis.process as NodeJS.Process | undefined
  return Boolean(proc?.['stdout']?.['isTTY'])
}

export function consoleAdapter(options: ConsoleAdapterOptions = {}): StorageAdapter {
  const { pretty = true, color = isTTY() } = options

  return {
    name: 'console',
    insertBatch(entries: LogEntry[]) {
      for (const entry of entries) {
        if (!pretty) {
          console.log(JSON.stringify(entry))
          continue
        }
        const statusColor = colorForStatus(entry.statusCode, color)
        const status = entry.statusCode ?? '---'
        const duration = formatDuration(entry.durationMs, color)
        const method = color ? `${COLORS.bold}${entry.method}${COLORS.reset}` : entry.method
        const trace = color
          ? `${COLORS.dim}[${entry.traceId.slice(0, 8)}]${COLORS.reset}`
          : `[${entry.traceId.slice(0, 8)}]`
        const prefix = color
          ? `${COLORS.magenta}apitrail${COLORS.reset}`
          : 'apitrail'
        const statusStr = color
          ? `${statusColor}${status}${COLORS.reset}`
          : String(status)

        console.log(`${prefix} ${trace} ${method} ${entry.path} ${statusStr} ${duration}`)

        if (entry.error) {
          const err = color ? `${COLORS.red}${entry.error.message}${COLORS.reset}` : entry.error.message
          console.log(`         ↳ ${err}`)
        }
      }
    },
  }
}
