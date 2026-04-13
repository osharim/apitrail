import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI = join(__dirname, '..', 'dist', 'cli.js')

// Skip these tests if the CLI hasn't been built yet. CI always builds first.
const built = existsSync(CLI)

function run(args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    })
    return { stdout, code: 0 }
  } catch (err) {
    const e = err as { stdout: Buffer; stderr: Buffer; status: number }
    return {
      stdout: `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`,
      code: e.status ?? 1,
    }
  }
}

describe.skipIf(!built)('apitrail CLI smoke tests', () => {
  it('prints version with --version', () => {
    const { stdout, code } = run(['--version'])
    expect(code).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('prints help with no args', () => {
    const { stdout, code } = run([])
    expect(code).toBe(0)
    expect(stdout).toContain('apitrail')
    expect(stdout).toContain('init')
    expect(stdout).toContain('status')
    expect(stdout).toContain('drop')
  })

  it('errors on unknown command', () => {
    const { stdout, code } = run(['unknown'])
    expect(code).toBe(1)
    expect(stdout).toContain('unknown command')
  })

  it('init --print outputs the schema SQL', () => {
    const { stdout, code } = run(['init', '--print'])
    expect(code).toBe(0)
    expect(stdout).toContain('CREATE TABLE IF NOT EXISTS "apitrail_spans"')
    expect(stdout).toContain('CREATE INDEX IF NOT EXISTS')
  })

  it('init --print --force includes DROP statement', () => {
    const { stdout, code } = run(['init', '--print', '--force'])
    expect(code).toBe(0)
    expect(stdout).toContain('DROP TABLE IF EXISTS "apitrail_spans"')
    expect(stdout).toContain('CREATE TABLE IF NOT EXISTS')
  })

  it('init --print --table honors custom name', () => {
    const { stdout, code } = run(['init', '--print', '--table', 'my_logs'])
    expect(code).toBe(0)
    expect(stdout).toContain('CREATE TABLE IF NOT EXISTS "my_logs"')
  })

  it('drop requires --yes', () => {
    const { stdout, code } = run(['drop'])
    expect(code).toBe(1)
    expect(stdout).toContain('--yes')
  })
})
