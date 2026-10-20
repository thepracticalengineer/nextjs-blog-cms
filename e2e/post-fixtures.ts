import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { assertDedicatedTestProject } from './environment'

// Service credentials are used only for isolated fixture setup, readback and cleanup.
// Application mutations under test must run through the authenticated editor.
export function fixtureDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
export async function seedPost(data: Record<string, unknown>) {
  const { userId } = JSON.parse(readFileSync('.e2e-state.json', 'utf8')) as { userId: string }
  const { meta_title, meta_description, editorial_reviewed, ...fields } = data
  void editorial_reviewed
  const result = await fixtureDatabase().from('posts').insert({ author_id: userId, status: 'draft', seo_title: meta_title, seo_description: meta_description, ...fields }).select('*').single()
  if (result.error) throw result.error
  return result.data
}
export async function readPost(id: string) {
  const result = await fixtureDatabase().from('posts').select('*').eq('id', id).single()
  if (result.error) throw result.error
  return result.data
}
export async function removePost(id: string) {
  const result = await fixtureDatabase().from('posts').delete().eq('id', id)
  if (result.error) throw result.error
}
