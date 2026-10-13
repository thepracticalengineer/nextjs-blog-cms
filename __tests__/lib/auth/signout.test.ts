import { describe, expect, it } from 'vitest'
import { authStorageKey, isAuthCredential, signOutWarning } from '@/lib/auth/signout'
describe('logout credential boundaries and messages', () => {
  const key = 'sb-test-auth-token'
  it('uses the installed SDK storage-key convention', () => {
    expect(authStorageKey('https://test.supabase.co')).toBe(key)
    expect(authStorageKey('http://127.0.0.1:54321')).toBe('sb-127-auth-token')
  })
  it.each([key, `${key}.12`, `${key}-user.1`, `${key}-code-verifier.0`, `${key}-flow-abc-code-verifier.2`, 'cms-oauth-context'])('clears credential %s', name => {
    expect(isAuthCredential(name, key)).toBe(true)
  })
  it.each(['sb-other-auth-token', `${key}-unrelated`, `${key}-flow-abc`, `${key}.invalid`, 'password-recovery', 'cms-draft-recovery'])('preserves unrelated or recovery data %s', name => {
    expect(isAuthCredential(name, key)).toBe(false)
  })
  it('returns only allowlisted logout warnings', () => {
    expect(signOutWarning('local_only')).toContain('server could not confirm')
    expect(signOutWarning('global_unconfirmed')).toContain('all devices could not be confirmed')
    expect(signOutWarning('<script>')).toBeNull()
    expect(signOutWarning(undefined)).toBeNull()
  })
})
