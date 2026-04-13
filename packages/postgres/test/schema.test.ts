import { describe, expect, it } from 'vitest'
import { createSchemaSQL, dropSchemaSQL, quoteIdent } from '../src/schema.js'

describe('quoteIdent', () => {
  it('quotes valid identifiers', () => {
    expect(quoteIdent('api_logs')).toBe('"api_logs"')
    expect(quoteIdent('MyTable')).toBe('"MyTable"')
    expect(quoteIdent('_underscore_first')).toBe('"_underscore_first"')
  })

  it('rejects invalid identifiers (injection attempts)', () => {
    expect(() => quoteIdent('foo; DROP TABLE users;')).toThrow()
    expect(() => quoteIdent('foo-bar')).toThrow()
    expect(() => quoteIdent('foo"bar')).toThrow()
    expect(() => quoteIdent('1leading_digit')).toThrow()
    expect(() => quoteIdent('')).toThrow()
  })
})

describe('createSchemaSQL', () => {
  it('uses the default table name', () => {
    const sql = createSchemaSQL()
    expect(sql).toContain('"apitrail_spans"')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS')
  })

  it('honors custom table name', () => {
    const sql = createSchemaSQL('my_logs')
    expect(sql).toContain('"my_logs"')
    expect(sql).toContain('"my_logs_created_at_idx"')
  })

  it('rejects dangerous table names', () => {
    expect(() => createSchemaSQL('foo; DROP TABLE users;')).toThrow()
  })
})

describe('dropSchemaSQL', () => {
  it('builds a safe drop statement', () => {
    expect(dropSchemaSQL('apitrail_spans')).toBe(
      'DROP TABLE IF EXISTS "apitrail_spans" CASCADE;',
    )
  })
})
