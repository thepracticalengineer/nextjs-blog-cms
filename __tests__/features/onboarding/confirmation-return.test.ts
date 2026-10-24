import { beforeEach, expect, it, vi } from 'vitest'
import { signSignupReturn, readSignupReturn } from '@/features/onboarding/confirmation-return'
beforeEach(() => vi.stubEnv('AUTH_ABUSE_HMAC_KEY', 'test-only-signing-key-at-least-32-characters'))
it('binds return destinations to verified email and rejects tampering and expiry', () => {
  const token = signSignupReturn('/blog/post#comments', 'New@example.com', 1000)
  expect(readSignupReturn(token, 'new@example.com', 1001)).toBe('/blog/post#comments')
  expect(readSignupReturn(token, 'other@example.com', 1001)).toBe('/dashboard')
  expect(readSignupReturn(token + 'x', 'new@example.com', 1001)).toBe('/dashboard')
  expect(readSignupReturn(token, 'new@example.com', 1000 + 86401)).toBe('/dashboard')
})
it('never signs external or looping destinations and tolerates absent or malformed tokens', () => {
  for (const token of [null, '', 'junk', 'a.b.c']) expect(readSignupReturn(token, 'new@example.com')).toBe('/dashboard')
  expect(signSignupReturn('//evil.test', 'new@example.com')).toBeNull()
})
