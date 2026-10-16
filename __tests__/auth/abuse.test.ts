import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ headers: vi.fn(), rpc: vi.fn(), result: vi.fn(), fetch: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: m.headers }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: m.rpc }) }))
import { authAbuseBlock, recordAuthLoginFailure } from '@/lib/auth/abuse'
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
  m.result.mockResolvedValue({ data: { allowed: true, retry_after: 0, ip_attempts: 1, challenge_required: false }, error: null })
  vi.stubGlobal('fetch', m.fetch)
})
it('ignores spoofed fallback headers and rejects missing/ambiguous trusted IPs', () => {
  expect(() => trustedClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).toThrow()
  for (const ip of ['1.2.3.4, 5.6.7.8', 'unknown', '1.2.3.4:80', 'fe80::1%eth0']) {
    expect(() => trustedClientIp(new Headers({ 'x-vercel-forwarded-for': ip }))).toThrow()
  }
  expect(trustedClientIp(new Headers({ 'x-vercel-forwarded-for': '2001:0db8:0:0:0:0:0:1' }))).toBe('2001:db8::/64')
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
  expect(m.rpc.mock.calls[2][1]).toEqual(args)
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
  m.result.mockResolvedValue({ data: { allowed: true, retry_after: 0, ip_attempts: 1, challenge_required: true }, error: null })
  expect(await authAbuseBlock('login', 'user@example.com')).toEqual({ error: 'Complete the security check and try again.', captchaRequired: true })
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: 'cms.example.com', action: 'login' }) })
  m.result.mockResolvedValue({ data: { allowed: true, retry_after: 0, ip_attempts: 1, challenge_required: false }, error: null })
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
  m.result.mockResolvedValue({ data: { allowed: true, retry_after: 0, ip_attempts: 1, challenge_required: true }, error: null })
  m.fetch.mockRejectedValue(new Error('PRIVATE'))
  expect(await authAbuseBlock('login', 'user@example.com', 'token')).toHaveProperty('retryAfter', 30)
  m.fetch.mockResolvedValue({ ok: false })
  expect(await authAbuseBlock('login', 'user@example.com', 'token')).toHaveProperty('captchaRequired', true)
  expect(await authAbuseBlock('login', 'user@example.com', 'x'.repeat(2049))).toHaveProperty('captchaRequired', true)
})

it('shares IPv6 /64 budgets while keeping separate prefixes independent', () => {
  const ip = (value: string) => trustedClientIp(new Headers({ 'x-vercel-forwarded-for': value }))
  expect(ip('2001:db8:1234:5678::1')).toBe(ip('2001:db8:1234:5678:ffff:ffff:ffff:ffff'))
  expect(ip('2001:db8:1234:5679::1')).not.toBe(ip('2001:db8:1234:5678::1'))
})
it('isolates botless account budgets by source IP to prevent cross-source victim lockout', async () => {
  await authAbuseBlock('login', 'victim@example.com')
  const first = m.rpc.mock.calls[0][1].p_account_key
  m.headers.mockResolvedValue(new Headers({ 'x-vercel-forwarded-for': '203.0.113.2' }))
  await authAbuseBlock('login', 'victim@example.com')
  expect(m.rpc.mock.calls[2][1].p_account_key).not.toBe(first)
})
it('verifies proof before reserving account work and accepts explicitly allowed alias hosts', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test-key')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://cms.example.com')
  vi.stubEnv('AUTH_TURNSTILE_HOSTNAMES', 'preview.example.com,www.example.com')
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: 'preview.example.com', action: 'login' }) })
  expect(await authAbuseBlock('login', 'victim@example.com', 'valid-proof')).toBeNull()
  expect(m.rpc).toHaveBeenCalledWith('reserve_auth_attempt', expect.objectContaining({ p_bot_protection: true, p_challenge_passed: true, p_phase: 'account' }))
})

it('keeps bot-protected account pressure global but authenticates password budgets by user ID', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test-key')
  await authAbuseBlock('login', 'victim@example.com')
  await authAbuseBlock('password', 'authorized-user-id')
  const first = m.rpc.mock.calls.filter(call => call[1].p_phase === 'ip').map(call => call[1].p_account_key)
  m.headers.mockResolvedValue(new Headers({ 'x-vercel-forwarded-for': '203.0.113.2' }))
  await authAbuseBlock('login', 'victim@example.com')
  await authAbuseBlock('password', 'authorized-user-id')
  expect(m.rpc.mock.calls[4][1].p_account_key).toBe(first[0])
  expect(m.rpc.mock.calls[6][1].p_account_key).toBe(first[1])
})

it('records credential failures only and never clears shared failures on success/provider outages', async () => {
  await recordAuthLoginFailure('user@example.com', { code: 'invalid_credentials', status: 400 })
  expect(m.rpc).toHaveBeenCalledWith('record_auth_login_failure', { p_account_key: expect.stringMatching(/^[a-f0-9]{64}$/) })
  m.rpc.mockClear()
  for (const error of [null, { status: 429 }, { status: 503 }, { code: 'request_timeout' }]) await recordAuthLoginFailure('user@example.com', error)
  expect(m.rpc).not.toHaveBeenCalled()
  m.result.mockRejectedValue(new Error('PRIVATE'))
  await expect(recordAuthLoginFailure('user@example.com', { code: 'invalid_credentials' })).resolves.toBeUndefined()
})
it('charges only IP work for rejected proof, including bot-provider transport failure', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test-key')
  m.fetch.mockRejectedValue(new Error('PRIVATE'))
  expect(await authAbuseBlock('recovery', 'victim@example.com', 'token')).toHaveProperty('retryAfter', 30)
  expect(m.rpc).toHaveBeenCalledWith('reserve_auth_attempt', expect.objectContaining({ p_bot_protection: true, p_challenge_passed: false, p_challenge_failed: true }))
})

it('checks exhausted IPs before any outbound proof verification', async () => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key')
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test-key')
  m.result.mockResolvedValue({ data: { allowed: false, retry_after: 41, challenge_required: false }, error: null })
  expect(await authAbuseBlock('login', 'victim@example.com', 'attacker-token')).toHaveProperty('retryAfter', 41)
  expect(m.fetch).not.toHaveBeenCalled()
})
