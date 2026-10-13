// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChunks, stringToBase64URL } from '@supabase/ssr'

const state = vi.hoisted(() => ({ cookies: [] as { name: string; value: string }[] }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => state.cookies }) }))
import { POST } from '@/app/api/auth/signout/route'

const key = 'sb-disposable-auth-token'
const request = (scope?: string) => new Request(`https://cms.test/api/auth/signout${scope ? `?scope=${scope}` : ''}`, { method: 'POST' })
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://disposable.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'synthetic-anon')
  state.cookies = createChunks(key, `base64-${stringToBase64URL(JSON.stringify({ access_token: 'synthetic-access', padding: 'x'.repeat(7000) }))}`)
  state.cookies.push({ name: `${key}-code-verifier`, value: 'synthetic' }, { name: `${key}-flow-abc-code-verifier`, value: 'synthetic' }, { name: `${key}-user`, value: 'synthetic' }, { name: 'theme', value: 'dark' }, { name: 'sb-other-auth-token', value: 'other-project' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function expectCleared(response: Response) {
  const cookies = response.headers.getSetCookie()
  for (const { name } of state.cookies.filter(c => c.name.startsWith(key))) {
    expect(cookies.some(c => c.startsWith(`${name}=`) && c.includes('Max-Age=0'))).toBe(true)
  }
  expect(cookies.join(';')).not.toContain('theme=')
  expect(cookies.join(';')).not.toContain('sb-other-auth-token=')
  expect(response.headers.get('cache-control')).toBe('no-store')
}
describe('POST /api/auth/signout', () => {
  it.each([undefined, 'local', 'global'])('revokes explicit %s scope without refreshing and clears all credential chunks', async scope => {
    const response = await POST(request(scope))
    expect(response.status).toBe(204)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(`https://disposable.supabase.co/auth/v1/logout?scope=${scope ?? 'local'}`, expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer synthetic-access', apikey: 'synthetic-anon' }), signal: expect.any(AbortSignal) }))
    expectCleared(response)
  })
  it.each([401, 403, 404, 500, 503])('honestly reports provider status %s while clearing local cookies', async status => {
    vi.mocked(fetch).mockResolvedValue(new Response('sensitive provider detail', { status }))
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ localCleared: true, remoteRevoked: false, code: 'SIGNOUT_REVOCATION_FAILED' })
    expectCleared(response)
  })
  it.each([new TypeError('network error'), new Error('unexpected error'), new DOMException('timeout', 'TimeoutError')])('clears cookies after thrown %s', async error => {
    vi.mocked(fetch).mockRejectedValue(error)
    const response = await POST(request('global'))
    expect(response.status).toBe(503)
    expectCleared(response)
  })
  it.each([['local', 401], ['global', 401], ['local', 403], ['global', 403]])('refreshes an expired credential once before revoking %s after %s within one deadline', async (scope, status) => {
    state.cookies = createChunks(key, `base64-${stringToBase64URL(JSON.stringify({ access_token: 'expired-access', refresh_token: 'synthetic-refresh' }))}`)
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: status as number }))
      .mockResolvedValueOnce(Response.json({ access_token: 'fresh-access', refresh_token: 'rotated-refresh', provider_token: 'must-not-persist' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const response = await POST(request(scope as string))
    expect(response.status).toBe(204)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://disposable.supabase.co/auth/v1/token?grant_type=refresh_token', expect.objectContaining({ method: 'POST', body: JSON.stringify({ refresh_token: 'synthetic-refresh' }), headers: expect.objectContaining({ apikey: 'synthetic-anon', 'Content-Type': 'application/json' }) }))
    expect(fetch).toHaveBeenNthCalledWith(3, `https://disposable.supabase.co/auth/v1/logout?scope=${scope}`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fresh-access' }) }))
    const signals = vi.mocked(fetch).mock.calls.map(([, options]) => options?.signal)
    expect(new Set(signals).size).toBe(1)
    expectCleared(response)
    expect(response.headers.getSetCookie().join('')).not.toContain('fresh-access')
    expect(response.headers.getSetCookie().join('')).not.toContain('rotated-refresh')
  })
  it.each(['denied', 'outage', 'network', 'timeout', 'malformed', 'missing-token', 'retry-denied'])('clears credentials and reports failed refresh/revocation: %s', async failure => {
    state.cookies = [{ name: key, value: JSON.stringify({ access_token: 'expired-access', refresh_token: 'synthetic-refresh' }) }]
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }))
    if (failure === 'network' || failure === 'timeout') vi.mocked(fetch).mockRejectedValueOnce(new TypeError(failure))
    else if (failure === 'malformed') vi.mocked(fetch).mockResolvedValueOnce(new Response('not-json'))
    else if (failure === 'missing-token') vi.mocked(fetch).mockResolvedValueOnce(Response.json({}))
    else if (failure === 'retry-denied') vi.mocked(fetch).mockResolvedValueOnce(Response.json({ access_token: 'fresh-access' })).mockResolvedValueOnce(new Response(null, { status: 401 }))
    else vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: failure === 'denied' ? 400 : 503 }))
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(fetch).toHaveBeenCalledTimes(failure === 'retry-denied' ? 3 : 2)
    expectCleared(response)
  })
  it('does not try refreshing during a logout provider outage', async () => {
    state.cookies = [{ name: key, value: JSON.stringify({ access_token: 'access', refresh_token: 'refresh' }) }]
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    expect((await POST(request())).status).toBe(503)
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('rejects unsupported scope without revoking or clearing credentials', async () => {
    const response = await POST(request('others'))
    expect(response.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toEqual([])
  })
  it('is idempotent with no session', async () => {
    state.cookies = [{ name: 'theme', value: 'dark' }]
    expect((await POST(request())).status).toBe(204)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('cannot confirm global revocation without session credentials', async () => {
    state.cookies = []
    const response = await POST(request('global'))
    expect(response.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('accepts legacy JSON cookie encoding and still clears it', async () => {
    state.cookies = [{ name: key, value: JSON.stringify({ access_token: 'synthetic-access' }) }]
    const response = await POST(request())
    expect(response.status).toBe(204)
    expectCleared(response)
  })
  it('clears corrupt sessions without claiming remote revocation', async () => {
    state.cookies = [{ name: `${key}.0`, value: 'base64-invalid' }, { name: `${key}.9`, value: 'stale' }]
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
    expectCleared(response)
  })
})
