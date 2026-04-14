import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { basicAuth } from '../src/server/auth.js'

function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
}

async function fetchWith(auth: string | undefined, authHeader?: string): Promise<Response> {
  const app = new Hono()
  if (auth) app.use('*', basicAuth(auth))
  app.get('/', (c) => c.text('ok'))
  return app.fetch(
    new Request('http://localhost/', { headers: authHeader ? { authorization: authHeader } : {} }),
  )
}

describe('basicAuth', () => {
  it('accepts the correct credentials', async () => {
    const res = await fetchWith('admin:s3cr3t', `Basic ${b64('admin:s3cr3t')}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('rejects when no header is sent', async () => {
    const res = await fetchWith('admin:s3cr3t')
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('Basic')
  })

  it('rejects wrong password', async () => {
    const res = await fetchWith('admin:s3cr3t', `Basic ${b64('admin:wrong')}`)
    expect(res.status).toBe(401)
  })

  it('rejects wrong user', async () => {
    const res = await fetchWith('admin:s3cr3t', `Basic ${b64('root:s3cr3t')}`)
    expect(res.status).toBe(401)
  })

  it('rejects non-Basic schemes', async () => {
    const res = await fetchWith('admin:s3cr3t', 'Bearer abc')
    expect(res.status).toBe(401)
  })

  it('rejects malformed base64', async () => {
    const res = await fetchWith('admin:s3cr3t', 'Basic not-base64!!!')
    expect(res.status).toBe(401)
  })
})
