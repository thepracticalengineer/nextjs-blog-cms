vi.mock('@/lib/auth/abuse', () => ({ authAbuseBlock: vi.fn(async () => null) }))
import { authAbuseBlock } from '@/lib/auth/abuse'
import { AuthRetryableFetchError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ client: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: m.client }))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate }))
import { login } from '@/app/(auth)/login/actions'
import { register } from '@/app/(auth)/register/actions'
function form() { const f = new FormData(); f.set('email', ' User@Example.com '); f.set('password', ' password '); f.set('full_name', '  New User  '); return f }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com')
  m.client.mockResolvedValue({ auth: { signInWithPassword: m.signIn, signUp: m.signUp } })
  m.signIn.mockResolvedValue({ error: null })
  m.signUp.mockResolvedValue({ data: { session: null }, error: null })
})
describe.each([['login', login, m.signIn], ['signup', register, m.signUp]] as const)('%s boundary', (_name, action, provider) => {
  it.each(['missing', 'file', 'duplicate', 'invalid', 'long'])('rejects %s email before Auth', async kind => {
    const f = form()
    if (kind === 'missing') f.delete('email')
    if (kind === 'file') f.set('email', new File(['x'], 'x.txt'))
    if (kind === 'duplicate') f.append('email', 'other@example.com')
    if (kind === 'invalid') f.set('email', 'invalid')
    if (kind === 'long') f.set('email', `${'a'.repeat(250)}@example.com`)
    expect(await action(f)).toHaveProperty('error')
    expect(m.client).not.toHaveBeenCalled()
  })
  it('rejects non-FormData input', async () => { expect(await action(null as unknown as FormData)).toHaveProperty('error'); expect(m.client).not.toHaveBeenCalled() })
  it('normalizes email and preserves password bytes', async () => { await action(form()); expect(provider.mock.calls[0][0]).toMatchObject({ email: 'user@example.com', password: ' password ' }) })
  it.each(['invalid_credentials', 'email_not_confirmed', 'user_not_found', 'user_already_exists', 'email_exists', 'unknown'])('hides provider details for %s', async code => {
    provider.mockResolvedValue({ error: { code, message: 'PRIVATE provider detail' } })
    const result = await action(form())
    expect(result).toHaveProperty('error')
    expect(result.error).not.toContain('PRIVATE')
  })
  it.each(['returned', 'thrown'])('maps %s rate limits', async kind => {
    const error = { code: 'over_request_rate_limit', status: 429, message: 'PRIVATE' }
    if (kind === 'returned') provider.mockResolvedValue({ error })
    else provider.mockRejectedValue(error)
    expect(await action(form())).toEqual({ error: 'Too many attempts. Wait a few minutes before trying again.', retryAfter: 60 })
  })
  it('recovers from client initialization failure', async () => { m.client.mockRejectedValue(new Error('PRIVATE')); expect(await action(form())).toEqual({ error: 'Unable to connect. Check your connection and try again.' }) })
  it('recovers from rejected provider requests', async () => { provider.mockRejectedValue(new Error('PRIVATE')); expect(await action(form())).toEqual({ error: 'Unable to connect. Check your connection and try again.' }) })
  it.each(['missing', 'file', 'duplicate', 'empty'])('rejects %s password', async kind => {
    const f = form()
    if (kind === 'missing') f.delete('password')
    if (kind === 'file') f.set('password', new File(['x'], 'x.txt'))
    if (kind === 'duplicate') f.append('password', 'anotherpassword')
    if (kind === 'empty') f.set('password', '')
    expect(await action(f)).toHaveProperty('error'); expect(m.client).not.toHaveBeenCalled()
  })
})
it.each(['missing', 'file', 'blank', 'long', 'duplicate'])('rejects %s signup name', async kind => {
  const f = form()
  if (kind === 'missing') f.delete('full_name')
  if (kind === 'file') f.set('full_name', new File(['x'], 'x.txt'))
  if (kind === 'blank') f.set('full_name', '  ')
  if (kind === 'long') f.set('full_name', 'a'.repeat(101))
  if (kind === 'duplicate') f.append('full_name', 'Other Name')
  expect(await register(f)).toHaveProperty('error'); expect(m.client).not.toHaveBeenCalled()
})
it('normalizes signup name', async () => { await register(form()); expect(m.signUp.mock.calls[0][0].options.data.full_name).toBe('New User') })
it('bounds new passwords', async () => { const f = form(); f.set('password', 'a'.repeat(1025)); expect(await register(f)).toHaveProperty('error'); expect(m.client).not.toHaveBeenCalled() })
it.each(['x', 'a'.repeat(5000)])('preserves legacy login password length', async password => { const f = form(); f.set('password', password); expect(await login(f)).toEqual({ success: true }); expect(m.signIn.mock.calls[0][0].password).toBe(password) })
it('returns identical login guidance for unknown, unconfirmed and invalid credentials', async () => {
  const results = []
  for (const code of ['user_not_found', 'email_not_confirmed', 'invalid_credentials']) { m.signIn.mockResolvedValue({ error: { code, message: code } }); results.push(await login(form())) }
  expect(results[0]).toEqual(results[1]); expect(results[1]).toEqual(results[2])
})

it('accepts signup name/password upper boundaries', async () => {
  const f = form(); f.set('full_name', 'a'.repeat(100)); f.set('password', 'a'.repeat(1024))
  expect(await register(f)).toEqual({ needsConfirmation: true })
})
it.each([
  [{ code: 'weak_password' }, 'Choose a stronger password and try again.'],
  [{ code: 'over_email_send_rate_limit' }, 'Too many attempts. Wait a few minutes before trying again.'],
  [{ status: 503 }, 'Authentication is temporarily unavailable. Please try again later.'],
  [{ code: 'request_timeout' }, 'Authentication is temporarily unavailable. Please try again later.'],
  [{ code: 'unexpected_failure' }, 'Authentication is temporarily unavailable. Please try again later.'],
  [{ code: 'signup_disabled' }, 'Email authentication is temporarily unavailable. Please try again later.'],
  [{ code: 'email_provider_disabled' }, 'Email authentication is temporarily unavailable. Please try again later.'],
])('maps signup provider failure %j to safe guidance', async (error, message) => {
  m.signUp.mockResolvedValue({ error: { ...error, message: 'PRIVATE' } })
  expect(await register(form())).toEqual({ error: message, ...('code' in error && error.code === 'over_email_send_rate_limit' ? { retryAfter: 60 } : {}) })
})

it.each([['login', login, m.signIn], ['signup', register, m.signUp]] as const)('%s reports returned SDK network failures as outages', async (_name, action, provider) => {
  provider.mockResolvedValue({ error: new AuthRetryableFetchError('PRIVATE fetch failure', 0) })
  expect(await action(form())).toEqual({ error: 'Authentication is temporarily unavailable. Please try again later.' })
})

it.each([['login', login, m.signIn], ['signup', register, m.signUp]] as const)('%s enforces the shared budget before Auth and passes the bot token', async (name, action, provider) => {
  const blocked = { error: 'Please wait', retryAfter: 25 }
  vi.mocked(authAbuseBlock).mockResolvedValueOnce(blocked)
  const f = form(); f.set('captchaToken', 'test-token')
  expect(await action(f)).toEqual(blocked)
  expect(authAbuseBlock).toHaveBeenCalledWith(name, 'user@example.com', 'test-token')
  expect(provider).not.toHaveBeenCalled()
})
