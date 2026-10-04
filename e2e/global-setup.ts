import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import crypto from 'node:crypto'

config({ path: '.env.e2e' })

const E2E_EMAIL = 'e2e-test@playwright.local'

export default async function globalSetup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing dedicated E2E Supabase credentials in .env.e2e or the environment')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 1. Create or reuse test user ──────────────────────────────────────────
  const { data: usersData, error: listUsersError } = await supabase.auth.admin.listUsers()
  if (listUsersError || !usersData) {
    throw new Error(`Failed to list test users: ${listUsersError?.message}`)
  }
  const { users } = usersData
  let userId: string
  const existing = users.find((u) => u.email === E2E_EMAIL)

  if (existing) {
    userId = existing.id
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: E2E_EMAIL,
      password: process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!', // NOSONAR — throwaway credential for local-only e2e test user
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`Failed to create test user: ${error?.message}`)
    userId = data.user.id
  }

  // ── 2. Upsert profiles row ────────────────────────────────────────────────
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, email: E2E_EMAIL, full_name: 'E2E Test User', role: 'author' })
  if (profileError) throw new Error(`Failed to upsert profile: ${profileError.message}`)

  // ── 3. Create API key ─────────────────────────────────────────────────────
  // Remove any leftover keys from a previous run
  await supabase.from('api_keys').delete().eq('user_id', userId)

  const rawBytes = crypto.randomBytes(32)
  const apiKey = `fmblog_${rawBytes.toString('hex')}`
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
  const keyPreview = `fmblog_...${apiKey.slice(-4)}`

  const { error: keyError } = await supabase.from('api_keys').insert({
    name: 'E2E Test Key',
    key_hash: keyHash,
    key_preview: keyPreview,
    user_id: userId,
    is_active: true,
  })
  if (keyError) throw new Error(`Failed to create API key: ${keyError.message}`)

  // ── 4. Seed three posts ───────────────────────────────────────────────────
  // Remove leftover posts from a previous interrupted run
  const { data: oldPosts } = await supabase.from('posts').select('id').eq('author_id', userId)
  if (oldPosts && oldPosts.length > 0) {
    await supabase.from('post_tags').delete().in('post_id', oldPosts.map((p) => p.id))
    await supabase.from('posts').delete().eq('author_id', userId)
  }

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .insert([
      {
        title: 'E2E Draft Post One',
        slug: 'e2e-draft-post-one',
        content: '<p>Draft content one</p>',
        excerpt: 'Draft excerpt one',
        status: 'draft',
        author_id: userId,
        seo_title: 'E2E Draft Post One',
      },
      {
        title: 'E2E Published Post',
        slug: 'e2e-published-post',
        content: '<p>Published content</p>',
        excerpt: 'Published excerpt',
        status: 'published',
        published_at: new Date().toISOString(),
        author_id: userId,
        seo_title: 'E2E Published Post',
      },
      {
        title: 'E2E Draft Post Two',
        slug: 'e2e-draft-post-two',
        content: '<p>Draft content two</p>',
        excerpt: 'Draft excerpt two',
        status: 'draft',
        author_id: userId,
        seo_title: 'E2E Draft Post Two',
      },
    ])
    .select('id')
  if (postsError || !posts) throw new Error(`Failed to seed posts: ${postsError?.message}`)

  // ── 5. Write state file ───────────────────────────────────────────────────
  const state = { apiKey, userId, email: E2E_EMAIL, seedPostIds: posts.map((p) => p.id) }
  writeFileSync('.e2e-state.json', JSON.stringify(state, null, 2))

  console.log(`✓ E2E setup complete — user: ${E2E_EMAIL}, posts: ${posts.length}`)
}
