import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { bold, cyan, dim, green, red } from './colors.js'

/**
 * Tiny interactive-prompt layer. Falls back gracefully when stdin isn't a TTY
 * (CI, scripts), returning defaults so nothing hangs.
 */

function isInteractive(): boolean {
  return Boolean((stdin as { isTTY?: boolean }).isTTY && (stdout as { isTTY?: boolean }).isTTY)
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

export async function input(
  message: string,
  opts: { default?: string; placeholder?: string } = {},
): Promise<string> {
  if (!isInteractive()) return opts.default ?? ''
  const hint = opts.default
    ? dim(` (${opts.default})`)
    : opts.placeholder
      ? dim(` (${opts.placeholder})`)
      : ''
  const answer = await ask(`${cyan('?')} ${bold(message)}${hint} `)
  return answer || opts.default || ''
}

export async function confirm(message: string, defaultValue = true): Promise<boolean> {
  if (!isInteractive()) return defaultValue
  const hint = defaultValue ? dim(' (Y/n)') : dim(' (y/N)')
  const answer = (await ask(`${cyan('?')} ${bold(message)}${hint} `)).toLowerCase()
  if (answer === '') return defaultValue
  return answer === 'y' || answer === 'yes'
}

export async function select<T extends string>(
  message: string,
  choices: readonly { value: T; label: string; hint?: string }[],
  defaultValue?: T,
): Promise<T> {
  const first = choices[0]
  if (!first) throw new Error('select() requires at least one choice')
  if (!isInteractive()) {
    return defaultValue ?? first.value
  }
  console.log(`${cyan('?')} ${bold(message)}`)
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i]
    if (!c) continue
    const marker = c.value === defaultValue ? '●' : '○'
    const hint = c.hint ? dim(` — ${c.hint}`) : ''
    console.log(`  ${dim(`${i + 1}.`)} ${marker} ${c.label}${hint}`)
  }
  const answer = await ask(`  ${dim(`Enter 1-${choices.length}:`)} `)
  const idx = Number.parseInt(answer, 10) - 1
  const picked = choices[idx]
  if (picked) return picked.value
  return defaultValue ?? first.value
}

export const log = {
  step: (msg: string) => console.log(`\n${bold(cyan('›'))} ${bold(msg)}`),
  done: (msg: string) => console.log(`  ${green('✓')} ${msg}`),
  skip: (msg: string) => console.log(`  ${dim('·')} ${dim(msg)}`),
  warn: (msg: string) => console.log(`  ${dim('!')} ${msg}`),
  fail: (msg: string) => console.log(`  ${red('✗')} ${msg}`),
  info: (msg: string) => console.log(`  ${dim(msg)}`),
}
