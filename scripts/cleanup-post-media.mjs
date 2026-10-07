/** Run with server environment loaded; never run against a test target implicitly. */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const apply = process.argv.includes('--apply')
if (!apply) {
  const { data, error } = await db.from('post_media').select('path, created_at, state')
    .eq('retained', false).neq('state', 'deleted').lt('created_at', new Date(Date.now() - 7 * 86400_000).toISOString()).limit(100)
  if (error) throw error
  console.log(JSON.stringify({ mode: 'dry-run', candidates: data }, null, 2))
} else {
  const { data, error } = await db.rpc('claim_abandoned_post_media', { p_limit: 100 })
  if (error) throw error
  for (const media of data) {
    const { error: removeError } = await db.storage.from('post-media').remove([media.path])
    if (removeError) throw new Error(`Removal failed for ${media.path}: ${removeError.message}. Retry this command to resume.`)
    // Keep tombstones so old local-only copies cannot restore deleted media URLs.
    const { error: markError } = await db.from('post_media').update({ state: 'deleted' }).eq('path', media.path).eq('state', 'deleting').eq('retained', false)
    if (markError) throw markError
  }
  console.log(`Removed ${data.length} abandoned images. Run again to process another batch.`)
}
