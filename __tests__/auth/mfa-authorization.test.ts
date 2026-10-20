import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(url) }) }))
vi.mock('server-only', () => ({}))
vi.mock('@/features/ai/providers', () => ({ verifyProviderKey: vi.fn() }))
vi.mock('@/features/posts/media/store', () => ({ storeImage: vi.fn() }))
vi.mock('@/features/posts/media/optimize', () => ({ optimizeImage: vi.fn() }))
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { authorizeSession, requireAuth } from '@/lib/auth/session'
import { ownsResource } from '@/lib/auth/api'
import * as keys from '@/app/api/settings/ai-providers/route'
import * as media from '@/app/api/post-media/route'
import * as subscribers from '@/app/api/newsletter/subscribers/export/route'

function clientFor(currentLevel = 'aal1', enrolled = true) {
  const profile = { id: 'owner', role: 'author' }
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }) }
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner', factors: enrolled ? [{ status: 'verified' }] : [] } }, error: null }),
      mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel, nextLevel: enrolled ? 'aal2' : 'aal1' }, error: null }) },
    },
    from: vi.fn().mockReturnValue(query),
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return client
}
beforeEach(() => vi.clearAllMocks())

const request = () => new Request('http://localhost/api/test', { method: 'POST', body: '{invalid', headers: { 'content-type': 'application/json' } }) as NextRequest
const endpoints: [string, () => Promise<Response>][] = [
  ['providers GET', () => keys.GET()], ['providers POST', () => keys.POST(request())], ['providers DELETE', () => keys.DELETE(request())],
  ['post media', () => media.POST(request())], ['subscribers export', () => subscribers.GET(request())],
]

describe.each(endpoints)('%s direct authorization', (_name, call) => {
  it.each(['aal1', 'lookup-error', 'lookup-throws', 'missing-level', 'no-user', 'identity-error', 'identity-throws'])('denies %s before private reads or side effects', async scenario => {
    const client = clientFor()
    let code = 'MFA_REQUIRED'; let status = 403
    if (scenario.startsWith('lookup') || scenario === 'missing-level' || scenario.startsWith('identity')) { code = 'AUTH_UNAVAILABLE'; status = 503 }
    if (scenario === 'lookup-error') client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    if (scenario === 'lookup-throws') client.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('unavailable'))
    if (scenario === 'missing-level') client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: null, nextLevel: null }, error: null })
    if (scenario === 'no-user') { client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null }); code = 'UNAUTHENTICATED'; status = 401 }
    if (scenario === 'identity-error') client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'unavailable' } })
    if (scenario === 'identity-throws') client.auth.getUser.mockRejectedValue(new Error('unavailable'))
    const response = await call()
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ code })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(client.from).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
it.each([['aal2', true], ['aal1', false]] as const)('allows %s enrolled=%s and retains role checks', async (level, enrolled) => {
  clientFor(level, enrolled)
  expect((await authorizeSession()).profile?.id).toBe('owner')
  expect((await authorizeSession('users:read')).failure?.code).toBe('FORBIDDEN')
  expect((await authorizeSession('ai_providers:write')).profile?.id).toBe('owner')
})
it('denies a stale AAL1 session even when cached factors say no enrollment', async () => {
  const client = clientFor()
  client.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
  expect((await authorizeSession()).failure?.code).toBe('MFA_REQUIRED')
})
it('fails closed when the profile lookup fails', async () => {
  const client = clientFor('aal2')
  client.from().maybeSingle.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
  expect((await authorizeSession()).failure?.code).toBe('AUTH_UNAVAILABLE')
})
it('redirects protected pages to MFA with a safe return path', async () => {
  clientFor()
  await expect(requireAuth('/dashboard/settings/ai-providers')).rejects.toThrow('/mfa?next=%2Fdashboard%2Fsettings%2Fai-providers')
})
it('never treats a different owner or missing owner as authorized', () => {
  expect(ownsResource({ id: 'owner' }, 'owner')).toBe(true)
  expect(ownsResource({ id: 'owner' }, 'other')).toBe(false)
  expect(ownsResource({ id: 'owner' }, undefined)).toBe(false)
})
it('fails page rendering on outages without entering a challenge redirect loop', async () => {
  const client = clientFor('aal2')
  client.from().maybeSingle.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
  await expect(requireAuth('/dashboard/settings/ai-providers')).rejects.toThrow('Authentication could not be verified')
})
it.each([
  new AuthSessionMissingError(),
  new AuthApiError('Expired', 401, 'session_expired'),
  new AuthApiError('Refresh token missing', 400, 'refresh_token_not_found'),
  new AuthApiError('Refresh token reused', 400, 'refresh_token_already_used'),
  new AuthApiError('Invalid JWT', 403, 'bad_jwt'),
  new AuthApiError('Deleted user', 403, 'user_not_found'),
])('classifies an absent or expired session as unauthenticated', async error => {
  const client = clientFor()
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error })
  expect((await authorizeSession()).failure?.code).toBe('UNAUTHENTICATED')
  const response = await keys.GET()
  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED', error: expect.stringContaining('Sign in again') })
  expect(client.from).not.toHaveBeenCalled()
})
it('preserves Next.js request-context signals during client construction', async () => {
  const signal = new Error('Dynamic server usage: cookies')
  vi.mocked(createClient).mockRejectedValueOnce(signal)
  await expect(authorizeSession()).rejects.toBe(signal)
})

it.each([
  new AuthRetryableFetchError('Network failure', 0),
  new AuthRetryableFetchError('Retryable fetch failure', 400),
  new AuthApiError('Service unavailable', 503, 'unexpected_failure'),
  new AuthApiError('Rate limited', 429, 'over_request_rate_limit'),
])('retains unavailable classification for retryable/provider errors', async error => {
  const client = clientFor()
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error })
  const response = await keys.GET()
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ code: 'AUTH_UNAVAILABLE' })
  expect(client.from).not.toHaveBeenCalled()
})
it('treats a missing profile as forbidden and redirects pages to login', async () => {
  const client = clientFor('aal2')
  client.from().maybeSingle.mockResolvedValue({ data: null, error: null })
  const response = await keys.GET()
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' })
  await expect(requireAuth()).rejects.toThrow('/login')
  expect(createServiceClient).not.toHaveBeenCalled()
})
