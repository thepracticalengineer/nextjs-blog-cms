import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, unlinkSync, existsSync } from 'node:fs'

config({ path: '.env.e2e' })

export default async function globalTeardown() {
  if (!existsSync('.e2e-state.json')) {
    console.log('No .e2e-state.json found — skipping teardown')
    return
  }

  const { userId, email } = JSON.parse(readFileSync('.e2e-state.json', 'utf8')) as {
    userId: string
    email: string
  }

  // Safety guard: only proceed if the state file belongs to the known e2e test user
  if (!email?.endsWith('@playwright.local')) {
    throw new Error(`Refusing teardown: unexpected email in .e2e-state.json ("${email}"). Aborting to prevent accidental data deletion.`)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing dedicated E2E Supabase credentials in .env.e2e or the environment')
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch all post IDs for this user (seed posts + any created by tests)
  const { data: posts } = await supabase
    .from('posts')
    .select('id')
    .eq('author_id', userId)

  const postIds = (posts ?? []).map((p) => p.id)

  if (postIds.length > 0) {
    await supabase.from('post_tags').delete().in('post_id', postIds)
    await supabase.from('posts').delete().eq('author_id', userId)
  }

  await supabase.from('api_keys').delete().eq('user_id', userId)
  await supabase.from('profiles').delete().eq('id', userId)
  await supabase.auth.admin.deleteUser(userId)

  unlinkSync('.e2e-state.json')

  console.log(`✓ E2E teardown complete — all rows for user ${userId} removed`)
}
