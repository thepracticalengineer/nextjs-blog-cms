import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ verify: vi.fn(), exchange: vi.fn(), grant: vi.fn(), clear: vi.fn() }))
vi.mock('@/app/auth/oauth/callback', () => ({ completeOAuth: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { verifyOtp: mocks.verify, exchangeCodeForSession: mocks.exchange } }) }))
vi.mock('@/lib/auth/recovery', () => ({ createRecoveryGrant: mocks.grant, clearRecoveryGrant: mocks.clear }))
import { GET } from '@/app/auth/callback/route'

const request = (query: string) => new Request(`https://example.com/auth/callback?${query}`)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.verify.mockResolvedValue({ data: { session: { user: { id: 'signup-user' } } }, error: null })
})

describe('signup confirmation boundary', () => {
  it.each(['', '&next=https://evil.invalid', '&next=/reset-password', '&next=/dashboard/admin'])('verifies only signup and uses a fixed destination (%s)', async extra => {
    const response = await GET(request(`type=signup&token_hash=hash${extra}`))
    expect(mocks.verify).toHaveBeenCalledWith({ token_hash: 'hash', type: 'signup' })
    expect(response.headers.get('location')).toBe('https://example.com/dashboard/onboarding/entry?next=%2Fdashboard')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.grant).not.toHaveBeenCalled()
  })
  it.each(['expired', 'replayed', 'invalid'])('offers a safe retry for %s tokens', async reason => {
    mocks.verify.mockResolvedValue({ data: { session: null }, error: { message: `private ${reason}` } })
    const response = await GET(request('type=signup&token_hash=hash'))
    expect(response.headers.get('location')).toBe('https://example.com/login?error=invalid_confirmation')
    expect(mocks.grant).not.toHaveBeenCalled()
  })
  it.each(['type=signup', 'type=signup&token_hash=', 'type=email&token_hash=hash', 'type=invite&token_hash=hash', 'token_hash=hash', 'type=unknown&code=legacy', 'code=legacy'])('rejects missing tokens, unsupported types and legacy codes (%s)', async query => {
    expect((await GET(request(query))).headers.get('location')).toBe('https://example.com/login?error=invalid_confirmation')
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.grant).not.toHaveBeenCalled()
  })
  it('fails safely when Auth throws or returns no session', async () => {
    mocks.verify.mockRejectedValueOnce(new Error('private transport failure'))
      .mockResolvedValueOnce({ data: { session: null }, error: null })
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await GET(request('type=signup&token_hash=hash'))).headers.get('location')).toContain('invalid_confirmation')
    }
  })
})

it('uses a signed destination only for its verified account email', async () => {
  const { signSignupReturn } = await import('@/features/onboarding/confirmation-return')
  vi.stubEnv('AUTH_ABUSE_HMAC_KEY', 'test-only-signup-key-at-least-32-characters')
  const token = signSignupReturn('/blog/article#comments', 'owner@example.com')!
  mocks.verify.mockResolvedValue({ data: { session: { user: { id: 'owner', email: 'owner@example.com' } } }, error: null })
  const response = await GET(request(`type=signup&token_hash=hash&return=${encodeURIComponent(token)}`))
  expect(new URL(response.headers.get('location')!).searchParams.get('next')).toBe('/blog/article#comments')
  mocks.verify.mockResolvedValue({ data: { session: { user: { id: 'other', email: 'other@example.com' } } }, error: null })
  const mismatched = await GET(request(`type=signup&token_hash=hash&return=${encodeURIComponent(token)}`))
  expect(new URL(mismatched.headers.get('location')!).searchParams.get('next')).toBe('/dashboard')
})
