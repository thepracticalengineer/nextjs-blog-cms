vi.mock('@/lib/auth/abuse', () => ({ authAbuseBlock: vi.fn(async () => null) }))
import { authAbuseBlock } from '@/lib/auth/abuse'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resend: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
import { resendConfirmation } from '@/app/(auth)/confirm-email/actions'

const form = (email: string) => { const data = new FormData(); data.set('email', email); return data }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.example.com/')
  mocks.createClient.mockResolvedValue({ auth: { resend: mocks.resend } })
  mocks.resend.mockResolvedValue({ error: null })
})
describe('neutral confirmation resend', () => {
  it.each(['', 'invalid'])('rejects malformed email %s before Auth', async email => {
    expect((await resendConfirmation(form(email))).error).toBe('Enter a valid email address')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('normalizes input and fixes signup type and redirect from configured origin', async () => {
    expect(await resendConfirmation(form(' person@example.com '))).toEqual({ success: true, retryAfter: 60 })
    expect(mocks.resend).toHaveBeenCalledWith({ type: 'signup', email: 'person@example.com', options: {
      emailRedirectTo: 'https://cms.example.com/auth/callback?type=signup',
    } })
  })
  it.each(['email_not_found', 'user_already_exists', 'over_email_send_rate_limit'])('does not disclose account-specific error %s', async code => {
    mocks.resend.mockResolvedValue({ error: { code, status: 429, message: 'private detail' } })
    expect(await resendConfirmation(form('person@example.com'))).toEqual({ success: true, retryAfter: 60 })
  })
  it('does not disclose account state through other provider responses', async () => {
    mocks.resend.mockResolvedValue({ error: { code: 'unexpected_failure', message: 'private detail' } })
    expect(await resendConfirmation(form('person@example.com'))).toEqual({ success: true, retryAfter: 60 })
  })
  it('offers a safe retry after transport failure', async () => {
    mocks.resend.mockRejectedValue(new Error('private detail'))
    expect((await resendConfirmation(form('person@example.com'))).error).toContain('try again')
  })
  it.each(['', 'javascript:alert(1)', 'https://user:password@example.com', 'http://cms.example.com'])('fails closed on invalid configured origin %s', async site => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', site)
    expect((await resendConfirmation(form('person@example.com'))).error).toBeTruthy()
    expect(mocks.resend).not.toHaveBeenCalled()
  })
})

it('blocks confirmation resend before Auth and keeps thrown Auth outcomes neutral', async () => {
  vi.mocked(authAbuseBlock).mockResolvedValueOnce({ error: 'Please wait', retryAfter: 25 })
  expect(await resendConfirmation(form('user@example.com'))).toEqual({ error: 'Please wait', retryAfter: 25 })
  expect(mocks.resend).not.toHaveBeenCalled()
  mocks.resend.mockRejectedValue({ code: 'over_email_send_rate_limit', status: 429, message: 'PRIVATE' })
  expect(await resendConfirmation(form('user@example.com'))).toEqual({ success: true, retryAfter: 60 })
})
