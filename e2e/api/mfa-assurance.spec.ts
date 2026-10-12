import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createHmac, randomUUID } from 'node:crypto'
import { assertDedicatedTestProject } from '../environment'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
function sessionClient() {
  const jar = new Map<string, string>()
  const client = createServerClient(url, anonKey, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: cookies => cookies.forEach(({ name, value }) => jar.set(name, value)),
  } })
  return { client, headers: () => ({ Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') }) }
}
function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.toUpperCase().replace(/=+$/, '')].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hash = createHmac('sha1', key).update(counter).digest()
  const offset = hash[hash.length - 1] & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

test('direct cookie APIs, database and storage require MFA only after verified enrollment', async ({ request }) => {
  test.setTimeout(120_000)
  assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const email = `mfa-boundaries-${randomUUID()}@playwright.local`
  const password = `Disposable-${randomUUID()}`
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
  expect(created.error).toBeNull()
  const id = created.data.user!.id
  const bookId = randomUUID()
  const path = `${id}/mfa-fixture.txt`
  try {
    expect((await service.from('ai_books').insert({ id: bookId, user_id: id, title: 'Private MFA fixture', file_name: 'fixture.pdf', extracted_text: 'private text' })).error).toBeNull()
    const first = sessionClient()
    expect((await first.client.auth.signInWithPassword({ email, password })).error).toBeNull()
    const preEnrollmentHeaders = first.headers()
    const preEnrollmentToken = (await first.client.auth.getSession()).data.session!.access_token
    // Non-enrolled AAL1 users retain normal access.
    expect((await request.get('/api/ai-assistant/books', { headers: first.headers() })).status()).toBe(200)
    expect((await first.client.from('ai_books').select('id').eq('id', bookId)).data).toHaveLength(1)
    const enrollment = await first.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'E2E MFA' })
    expect(enrollment.error).toBeNull()
    const factorId = enrollment.data!.id
    const secret = enrollment.data!.totp.secret
    expect((await first.client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) })).error).toBeNull()
    // A token issued before enrollment cannot bypass the authoritative factor check.
    expect((await request.get('/api/ai-assistant/books', { headers: preEnrollmentHeaders })).status()).toBe(403)
    const staleRead = await request.get(`${url}/rest/v1/ai_books?select=id&id=eq.${bookId}`, { headers: { apikey: anonKey, Authorization: `Bearer ${preEnrollmentToken}` } })
    expect(await staleRead.json()).toEqual([])
    // A new password-only session is AAL1 even though the account is enrolled.
    const second = sessionClient()
    expect((await second.client.auth.signInWithPassword({ email, password })).error).toBeNull()
    expect((await second.client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal1')
    for (const endpoint of ['/api/ai-assistant/books', '/api/ai-assistant/chats', '/api/developer/keys', '/api/developer/llm-keys']) {
      const response = await request.get(endpoint, { headers: second.headers() })
      expect(response.status(), endpoint).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' })
    }
    const mutation = await request.post('/api/developer/keys', { headers: second.headers(), data: { name: 'Must not be created' } })
    expect(mutation.status()).toBe(403)
    const layout = await request.get('/dashboard/ai-assistant', { headers: second.headers(), maxRedirects: 0 })
    expect(layout.status()).toBe(307)
    expect(layout.headers().location).toContain('/mfa?next=')
    expect((await second.client.from('profiles').select('id').eq('id', id)).data).toEqual([])
    expect((await second.client.from('ai_books').select('id').eq('id', bookId)).data).toEqual([])
    expect((await second.client.from('ai_books').insert({ user_id: id, title: 'Blocked', file_name: 'blocked.pdf', extracted_text: 'blocked' })).error).not.toBeNull()
    expect((await second.client.storage.from('ai-books').upload(path, 'private fixture')).error).not.toBeNull()
    expect((await second.client.from('public_author_profiles').select('id').eq('id', id)).data).toHaveLength(1)
    // Supabase rejects reuse of an enrollment code; wait for a fresh TOTP step.
    await new Promise(resolve => setTimeout(resolve, 30_100 - Date.now() % 30_000))
    expect((await second.client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) })).error).toBeNull()
    expect((await second.client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe('aal2')
    expect((await request.get('/api/ai-assistant/books', { headers: second.headers() })).status()).toBe(200)
    expect((await request.get('/api/developer/llm-keys', { headers: second.headers() })).status()).toBe(200)
    expect((await request.post('/api/developer/keys', { headers: second.headers(), data: { name: 'AAL2 fixture' } })).status()).toBe(201)
    expect((await second.client.from('profiles').select('id').eq('id', id)).data).toHaveLength(1)
    expect((await second.client.from('ai_books').select('id').eq('id', bookId)).data).toHaveLength(1)
    expect((await second.client.storage.from('ai-books').upload(path, 'private fixture')).error).toBeNull()
    expect((await second.client.storage.from('ai-books').download(path)).error).toBeNull()
  } finally {
    expect((await service.storage.from('ai-books').remove([path])).error).toBeNull()
    expect((await service.auth.admin.deleteUser(id)).error).toBeNull()
  }
})
