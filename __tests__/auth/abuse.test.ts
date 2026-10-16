import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ headers: vi.fn(), rpc: vi.fn(), result: vi.fn(), fetch: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: m.headers }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: m.rpc }) }))
import { authAbuseBlock } from '@/lib/auth/abuse'
import { trustedClientIp } from '@/lib/auth/client-ip'

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('AUTH_ABUSE_HMAC_KEY', 'test-only-key-with-at-least-32-bytes')
  vi.stubEnv('AUTH_TRUSTED_IP_HEADER', 'x-vercel-forwarded-for')
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
  vi.stubEnv('TURNSTILE_SECRET_KEY', '')
  m.rpc.mockImplementation(() => ({ abortSignal: m.result }))
  m.headers.mockResolvedValue(new Headers({ 'x-vercel-forwarded-for': '203.0.113.1' }))
  m.result.mockResolvedValue({ data: { allowed: true, retry_after: 0, challenge_required: false }, error: null })
  vi.stubGlobal('fetch', m.fetch)
})
it('ignores spoofed fallback headers and rejects missing/ambiguous trusted IPs', () => {
  expect(() => trustedClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).toThrow()
  for (const ip of ['1.2.3.4, 5.6.7.8', 'unknown', '1.2.3.4:80', 'fe80::1%eth0']) {
    expect(() => trustedClientIp(new Headers({ 'x-vercel-forwarded-for': ip }))).toThrow()
  }
  expect(trustedClientIp(new Headers({ 'x-vercel-forwarded-for': '2001:0db8:0:0:0:0:0:1' }))).toBe('2001:db8::1')
})
it('does not trust headers by default', () => {
  vi.stubEnv('AUTH_TRUSTED_IP_HEADER', '')
  expect(trustedClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).toBe('unknown')
})
it('stores only domain-separated HMACs and normalizes email', async () => {
  expect(await authAbuseBlock('login', ' User@Example.com ')).toBeNull()
  const args = m.rpc.mock.calls[0][1]
  expect(args.p_account_key).toMatch(/^[a-f0-9]{64}$/)
  expect(args.p_ip_key).toMatch(/^[a-f0-9]{64}$/)
  expect(JSON.stringify(args)).not.toMatch(/example|203\.0/)
  await authAbuseBlock('login', 'user@example.com')
  expect(m.rpc.mock.calls[1][1]).toEqual(args)
})
it.each(['error', 'throw', 'malformed', 'no-secret', 'bad-ip'])('fails closed on %s', async kind => {
  if (kind === 'error') m.result.mockResolvedValue({ data: null, error: { message: 'PRIVATE' } })
  if (kind === 'throw') m.result.mockRejectedValue(new Error('PRIVATE'))
  if (kind === 'malformed') m.result.mockResolvedValue({ data: { allowed: true }, error: null })
  if (kind === 'no-secret') vi.stubEnv('AUTH_ABUSE_HMAC_KEY', '')
  if (kind === 'bad-ip') m.headers.mockResolvedValue(new Headers())
  expect(await authAbuseBlock('login', 'user@example.com')).toEqual({ error: 'Authentication is temporarily unavailable. Please try again later.', retryAfter: 30 })
})
it('returns a neutral bounded cooldown from the shared store', async () => {
  m.result.mockResolvedValue({ data: { allowed: false, retry_after: 41, challenge_required: true }, error: null })
  expect(await authAbuseBlock('login', 'user@example.com')).toEqual({ error: 'Too many attempts. Please wait before trying again.', retryAfter: 41 })
})
it('requires a bot check progressively and verifies hostname/action before allowing Auth', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test-key')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.example.com')
  m.result.mockResolvedValue({ data: { allowed: true, retry_after: 0, challenge_required: true }, error: null })
  expect(await authAbuseBlock('login', 'user@example.com')).toEqual({ error: 'Complete the security check and try again.', captchaRequired: true })
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: 'cms.example.com', action: 'login' }) })
  expect(await authAbuseBlock('login', 'user@example.com', 'valid-token')).toBeNull()
  expect(m.fetch.mock.calls[0][0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
  for (const response of [{ success: false }, { success: true, hostname: 'evil.example', action: 'login' }, { success: true, hostname: 'cms.example.com', action: 'signup' }]) {
    m.fetch.mockResolvedValue({ ok: true, json: async () => response })
    expect((await authAbuseBlock('login', 'user@example.com', 'replayed-token'))?.captchaRequired).toBe(true)
  }
})
it('never calls the bot service for low-volume or authenticated actions', async () => {
  await authAbuseBlock('login', 'user@example.com', 'unused')
  await authAbuseBlock('password', 'user-id')
  expect(m.fetch).not.toHaveBeenCalled()
})

it('canonicalizes IPv4-mapped addresses and ignores other attacker headers', () => {
  expect(trustedClientIp(new Headers({ 'x-vercel-forwarded-for': '::ffff:203.0.113.1', 'x-forwarded-for': '1.2.3.4' }))).toBe('203.0.113.1')
})
it('rejects missing ingress configuration in production', () => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AUTH_TRUSTED_IP_HEADER', '')
  expect(() => trustedClientIp(new Headers())).toThrow()
})
it('fails closed on partially configured bot protection and bot transport failures', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  expect(await authAbuseBlock('login', 'user@example.com')).toHaveProperty('retryAfter', 30)
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test-key')
  m.result.mockResolvedValue({ data: { allowed: true, retry_after: 0, challenge_required: true }, error: null })
  m.fetch.mockRejectedValue(new Error('PRIVATE'))
  expect(await authAbuseBlock('login', 'user@example.com', 'token')).toHaveProperty('retryAfter', 30)
  m.fetch.mockResolvedValue({ ok: false })
  expect(await authAbuseBlock('login', 'user@example.com', 'token')).toHaveProperty('captchaRequired', true)
  expect(await authAbuseBlock('login', 'user@example.com', 'x'.repeat(2049))).toHaveProperty('captchaRequired', true)
})
