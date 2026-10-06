import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getUser, getAal, getRole, createServerClient } = vi.hoisted(() => ({
  getUser: vi.fn(), getAal: vi.fn(), getRole: vi.fn(), createServerClient: vi.fn(),
}))
vi.mock('@supabase/ssr', () => ({ createServerClient }))
import { proxy } from '@/proxy'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  getUser.mockResolvedValue({ data: { user: { id: 'user' } } })
  getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
  getRole.mockResolvedValue({ data: { role: 'author' } })
  createServerClient.mockImplementation((_url, _key, options) => {
    // Simulate the SSR client's session refresh and its anti-cache headers.
    options.cookies.setAll([{ name: 'refreshed-session', value: 'new-session', options: { httpOnly: true } }], {
      'Cache-Control': 'private, no-store', Pragma: 'no-cache', Expires: '0',
    })
    const chain = { select: () => chain, eq: () => chain, single: getRole }
    return { auth: { getUser, mfa: { getAuthenticatorAssuranceLevel: getAal } }, from: () => chain }
  })
})

function request(path: string) { return new NextRequest(`https://example.com${path}`) }

function expectRefresh(response: Awaited<ReturnType<typeof proxy>>) {
  expect(response.cookies.get('refreshed-session')?.value).toBe('new-session')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('pragma')).toBe('no-cache')
  expect(response.headers.get('expires')).toBe('0')
}

describe('Supabase proxy redirects', () => {
  it('passes authenticated dashboard requests with refreshed cookies and headers', async () => {
    const req = request('/dashboard')
    const response = await proxy(req)
    expect(response.headers.get('location')).toBeNull()
    expect(req.cookies.get('refreshed-session')?.value).toBe('new-session')
    expectRefresh(response)
  })

  it('redirects anonymous requests to login without losing refresh headers', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const response = await proxy(request('/dashboard'))
    expect(response.headers.get('location')).toBe('https://example.com/login')
    expectRefresh(response)
  })

  it.each([
    { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null },
    { data: null, error: { message: 'MFA lookup failed' } },
  ])('enforces MFA and fails closed on lookup failure', async (aal) => {
    getAal.mockResolvedValue(aal)
    const response = await proxy(request('/dashboard'))
    expect(response.headers.get('location')).toBe('https://example.com/mfa')
    expectRefresh(response)
  })

  it('blocks authors from admin routes', async () => {
    const response = await proxy(request('/dashboard/admin/users'))
    expect(response.headers.get('location')).toBe('https://example.com/dashboard')
    expectRefresh(response)
  })

  it('allows admins and redirects completed MFA away from the challenge', async () => {
    getRole.mockResolvedValue({ data: { role: 'admin' } })
    expect((await proxy(request('/dashboard/admin/users'))).headers.get('location')).toBeNull()
    getAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
    const response = await proxy(request('/mfa'))
    expect(response.headers.get('location')).toBe('https://example.com/dashboard')
    expectRefresh(response)
  })
})

describe('Password recovery navigation', () => {
  it.each(['/forgot-password', '/reset-password'])('allows %s with or without a session', async path => {
    expect((await proxy(request(path))).headers.get('location')).toBeNull()
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await proxy(request(path))).headers.get('location')).toBeNull()
  })
})
