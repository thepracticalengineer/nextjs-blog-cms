import { createServerClient } from '@supabase/ssr'
import { test, expect } from '../fixtures'
import { fixtureDatabase, readPost } from '../post-fixtures'
import { readFileSync } from 'node:fs'

test('retired mutations ignore a genuine owner session and preserve persisted posts', async ({ request, seedPostIds }) => {
  const { userId } = JSON.parse(readFileSync('.e2e-state.json', 'utf8')) as { userId: string }
  const cookies = new Map<string, string>()
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: updates => updates.forEach(({ name, value }) => cookies.set(name, value)) },
  })
  expect((await client.auth.signInWithPassword({ email: 'e2e-test@playwright.local', password: process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!' })).error).toBeNull()
  const headers = { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') }
  const before = await readPost(seedPostIds[0])
  const db = fixtureDatabase()
  const countBefore = await db.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId)
  for (const method of ['PATCH', 'DELETE']) {
    const response = await request.fetch(`/api/posts/${before.id}`, { method, headers, data: { title: 'Retired mutation must not persist', status: 'published', editorial_reviewed: true } })
    expect(response.status()).toBe(410)
    expect(await response.json()).toMatchObject({ code: 'API_RETIRED' })
  }
  expect((await request.post('/api/posts/create', { headers, data: { title: 'Retired creation must not persist' } })).status()).toBe(410)
  expect(await readPost(before.id)).toEqual(before)
  const countAfter = await db.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId)
  expect(countBefore.error).toBeNull()
  expect(countAfter.error).toBeNull()
  expect(countAfter.count).toBe(countBefore.count)
  await client.auth.signOut({ scope: 'local' })
})
