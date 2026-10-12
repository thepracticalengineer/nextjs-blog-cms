import { createClient } from '@/lib/supabase/server'

/** Route-only fixtures; real identity/assurance guards have dedicated tests. */
export async function routeTestSession() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  return user
    ? { profile: { id: user.id, role: 'author' }, failure: null }
    : { profile: null, failure: { code: 'UNAUTHENTICATED', status: 401, error: 'Unauthorized' } }
}
