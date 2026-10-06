import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ request: vi.fn(), consume: vi.fn(), clear: vi.fn(), clearAuth: vi.fn(), update: vi.fn(), signOut: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { resetPasswordForEmail: mocks.request } }) }))
vi.mock('@/lib/auth/recovery', () => ({
  consumeRecoveryGrant: mocks.consume, clearRecoveryGrant: mocks.clear, clearRecoveryAuthCookies: mocks.clearAuth,
  RECOVERY_ERROR: 'Invalid recovery link',
}))
import { requestPasswordReset } from '@/app/(auth)/forgot-password/actions'
import { resetPassword } from '@/app/(auth)/reset-password/actions'

function form(values: Record<string, string>) {
  const result = new FormData()
  for (const [key, value] of Object.entries(values)) result.set(key, value)
  return result
}
const validPasswords = () => form({ password: 'NewPassword123!', confirmPassword: 'NewPassword123!' })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.com')
  mocks.request.mockResolvedValue({ error: null })
  mocks.consume.mockResolvedValue({ auth: { updateUser: mocks.update, signOut: mocks.signOut } })
  mocks.update.mockResolvedValue({ error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})

describe('requestPasswordReset', () => {
  it.each(['', 'invalid'])('rejects invalid email %s without calling Auth', async email => {
    expect(await requestPasswordReset(form({ email }))).toEqual({ error: 'Enter a valid email address' })
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('normalizes email and uses the trusted configured callback', async () => {
    expect(await requestPasswordReset(form({ email: ' user@example.com ' }))).toEqual({ success: true })
    expect(mocks.request).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://example.com/auth/callback?next=/reset-password',
    })
  })
  it.each(['registered@example.com', 'unknown@example.com'])('returns identical success for %s', async email => {
    expect(await requestPasswordReset(form({ email }))).toEqual({ success: true })
  })
  it.each(['over_email_send_rate_limit', 'email_not_found'])('hides address-specific error %s', async code => {
    mocks.request.mockResolvedValue({ error: { code, status: 429, message: 'Private detail' } })
    expect(await requestPasswordReset(form({ email: 'user@example.com' }))).toEqual({ success: true })
  })
  it('handles global rate limiting', async () => {
    mocks.request.mockResolvedValue({ error: { code: 'over_request_rate_limit', status: 429 } })
    expect(await requestPasswordReset(form({ email: 'user@example.com' }))).toEqual({ error: 'Too many requests. Please wait a few minutes before trying again.' })
  })
  it('handles delivery errors without echoing provider/account details', async () => {
    mocks.request.mockResolvedValue({ error: { message: 'smtp private detail' } })
    expect(await requestPasswordReset(form({ email: 'user@example.com' }))).toEqual({ error: 'Unable to request a reset email right now. Please try again later.' })
  })
  it('handles network failures', async () => {
    mocks.request.mockRejectedValue(new Error('network'))
    expect((await requestPasswordReset(form({ email: 'user@example.com' }))).error).toBeTruthy()
  })
  it('fails safely without a site URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect((await requestPasswordReset(form({ email: 'user@example.com' }))).error).toBeTruthy()
    expect(mocks.request).not.toHaveBeenCalled()
  })
})

describe('resetPassword', () => {
  it.each([
    { password: 'short', confirmPassword: 'short' },
    { password: 'NewPassword123!', confirmPassword: 'OtherPassword123!' },
  ])('validates passwords before consuming recovery', async values => {
    expect((await resetPassword(form(values))).error).toBeTruthy()
    expect(mocks.consume).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('rejects missing, expired or consumed grants before updating the password', async () => {
    mocks.consume.mockResolvedValue(null)
    expect(await resetPassword(validPasswords())).toEqual({ error: 'Invalid recovery link', invalidRecovery: true })
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('updates only after consuming recovery and ends the recovery session', async () => {
    expect(await resetPassword(validPasswords())).toEqual({ success: true })
    expect(mocks.update).toHaveBeenCalledWith({ password: 'NewPassword123!' })
    expect(mocks.consume.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0])
    expect(mocks.clear).toHaveBeenCalled()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })
  it('clears browser credentials even when remote sign-out returns an error', async () => {
    mocks.signOut.mockResolvedValue({ error: { message: 'network' } })
    expect(await resetPassword(validPasswords())).toEqual({ success: true })
    expect(mocks.clearAuth).toHaveBeenCalledOnce()
  })
  it('does not report a completed password update as failed if sign-out throws', async () => {
    mocks.signOut.mockRejectedValue(new Error('network'))
    expect(await resetPassword(validPasswords())).toEqual({ success: true })
    expect(mocks.clearAuth).toHaveBeenCalledOnce()
  })
  it('explains MFA requirements without recommending another email', async () => {
    mocks.update.mockResolvedValue({ error: { code: 'insufficient_aal', status: 401 } })
    expect(await resetPassword(validPasswords())).toEqual({
      error: 'This account requires two-factor verification before its password can be changed. Contact an administrator for help; another reset email will not resolve this.',
      invalidRecovery: true,
      mfaBlocked: true,
    })
  })
  it('explains why a rejected weak password needs a new link', async () => {
    mocks.update.mockResolvedValue({ error: { code: 'weak_password', status: 422 } })
    const result = await resetPassword(validPasswords())
    expect(result.error).toContain('This reset link has been used')
    expect(result.error).toContain('Request a new link and choose a stronger password')
    expect(result.invalidRecovery).toBe(true)
  })
  it.each(['weak_password', 'same_password', 'unknown'])('offers a new link after provider error %s', async code => {
    mocks.update.mockResolvedValue({ error: { code, status: 400, message: 'Private provider detail' } })
    const result = await resetPassword(validPasswords())
    expect(result.invalidRecovery).toBe(true)
    expect(result.error).not.toContain('Private provider detail')
  })
  it('fails closed on recovery storage/network errors', async () => {
    mocks.consume.mockRejectedValue(new Error('db'))
    expect((await resetPassword(validPasswords())).invalidRecovery).toBe(true)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
