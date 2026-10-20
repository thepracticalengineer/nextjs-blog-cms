// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/session', () => ({ authorizeSession: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/encryption', () => ({ encryptSecret: vi.fn(() => 'encrypted'), decryptSecret: vi.fn(() => 'owner-plain') }))
vi.mock('@/features/ai/providers', () => ({ verifyProviderKey: vi.fn() }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }))
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { verifyProviderKey } from '@/features/ai/providers'
import { checkRateLimit } from '@/lib/rateLimit'
import { GET, POST, DELETE } from '@/app/api/settings/ai-providers/route'
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), upsert: vi.fn(), delete: vi.fn(), update: vi.fn(), maybeSingle: vi.fn() }
const from = vi.fn(() => query)
const record = { provider: 'openai', key_preview: '...1234', is_valid: null, last_verified_at: null }
const request = (body: unknown, origin = 'http://localhost', method = 'POST') => new Request('http://localhost/api/settings/ai-providers', { method, headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(authorizeSession).mockResolvedValue({ profile: { id: owner, role: 'author' }, failure: null } as Awaited<ReturnType<typeof authorizeSession>>)
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>)
  for (const fn of [query.select, query.eq, query.order, query.delete, query.update]) fn.mockReturnValue(query)
  query.upsert.mockResolvedValue({ error: null })
  query.maybeSingle.mockResolvedValue({ data: { ...record, encrypted_key: 'cipher' }, error: null })
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true })
})
it('lists only owner masked metadata and ignores shared environment keys', async () => {
  query.order.mockResolvedValue({ data: [record], error: null })
  const response = await GET()
  expect(await response.json()).toEqual({ keys: [record] })
  expect(query.select).toHaveBeenCalledWith('provider, key_preview, is_valid, last_verified_at')
  expect(query.eq).toHaveBeenCalledWith('user_id', owner)
  expect(response.headers.get('cache-control')).toBe('no-store')
})
it('saves encrypted owner credentials without implicit verification or secret response', async () => {
  const response = await POST(request({ provider: 'openai', api_key: 'new-secret-1234', user_id: 'attacker' }))
  expect(response.status).toBe(200)
  expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: owner, encrypted_key: 'encrypted', key_preview: '...1234', is_valid: null }), { onConflict: 'user_id,provider' })
  expect(JSON.stringify(await response.json())).not.toContain('new-secret')
  expect(verifyProviderKey).not.toHaveBeenCalled()
})
it.each([{}, { provider: 'unknown', api_key: 'abcdefgh' }, { provider: 'openai', api_key: 123 }, { provider: 'openai', api_key: 'short' }])('rejects invalid input %j before database access', async body => {
  expect((await POST(request(body))).status).toBe(400)
  expect(from).not.toHaveBeenCalled()
})
it('rejects malformed JSON and cross-origin mutation', async () => {
  expect((await POST(new Request('http://localhost/api/settings/ai-providers', { method: 'POST', headers: { origin: 'http://localhost' }, body: '{' }))).status).toBe(400)
  expect((await POST(request({}, 'https://evil.example'))).status).toBe(403)
  expect(from).not.toHaveBeenCalled()
})
it('authenticates and requires MFA before private reads', async () => {
  vi.mocked(authorizeSession).mockResolvedValue({ profile: null, failure: { code: 'MFA_REQUIRED', status: 403, error: 'MFA required' } })
  expect((await GET()).status).toBe(403)
  expect((await POST(request({}))).status).toBe(403)
  expect((await DELETE(request({}, 'http://localhost', 'DELETE'))).status).toBe(403)
  expect(createClient).not.toHaveBeenCalled()
})
it('verifies only saved owner key and guards against concurrent replacement', async () => {
  vi.mocked(verifyProviderKey).mockResolvedValue('verified')
  query.maybeSingle.mockResolvedValueOnce({ data: { encrypted_key: 'cipher' }, error: null }).mockResolvedValueOnce({ data: record, error: null })
  const response = await POST(request({ provider: 'openai', action: 'verify' }))
  expect(response.status).toBe(200)
  expect(verifyProviderKey).toHaveBeenCalledWith('openai', 'owner-plain')
  expect(query.eq).toHaveBeenCalledWith('user_id', owner)
  expect(query.eq).toHaveBeenCalledWith('encrypted_key', 'cipher')
})
it('does not mark a credential invalid during transient verification failure', async () => {
  vi.mocked(verifyProviderKey).mockResolvedValue('unavailable')
  const response = await POST(request({ provider: 'openai', action: 'verify' }))
  expect(response.status).toBe(503)
  expect(query.update).not.toHaveBeenCalled()
})
it('returns conflict if verification raced a deletion or replacement', async () => {
  vi.mocked(verifyProviderKey).mockResolvedValue('verified')
  query.maybeSingle.mockResolvedValueOnce({ data: { encrypted_key: 'cipher' }, error: null }).mockResolvedValueOnce({ data: null, error: null })
  expect((await POST(request({ provider: 'openai', action: 'verify' }))).status).toBe(409)
})
it('deletes only owner key with no implicit fallback', async () => {
  query.eq.mockReturnValueOnce(query).mockResolvedValueOnce({ error: null })
  expect((await DELETE(request({ provider: 'openai' }, 'http://localhost', 'DELETE'))).status).toBe(200)
  expect(query.eq).toHaveBeenCalledWith('user_id', owner)
  expect(query.eq).toHaveBeenCalledWith('provider', 'openai')
})
it('limits credential mutations before database or provider access', async () => {
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, retryAfter: 60 })
  expect((await POST(request({ provider: 'openai', action: 'verify' }))).status).toBe(429)
  expect(from).not.toHaveBeenCalled()
})

it('matches the browser Host when Next constructs an internal localhost URL, without trusting forwarded hosts', async () => {
  const headers = { origin: 'http://127.0.0.1:3111', host: '127.0.0.1:3111', 'content-type': 'application/json' }
  const body = JSON.stringify({ provider: 'openai', api_key: 'private-key-1234' })
  expect((await POST(new Request('http://localhost:3111/api/settings/ai-providers', { method: 'POST', headers, body }))).status).toBe(200)
  expect((await POST(new Request('http://localhost:3111/api/settings/ai-providers', { method: 'POST', headers: { ...headers, origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' }, body }))).status).toBe(403)
})
it('rejects a stale settings page belonging to a previous signed-in owner', async () => {
  expect((await POST(request({ provider: 'openai', api_key: 'private-key-1234', owner_id: 'other' }))).status).toBe(409)
  expect((await DELETE(request({ provider: 'openai', owner_id: 'other' }, 'http://localhost', 'DELETE'))).status).toBe(409)
  expect(from).not.toHaveBeenCalled()
})
