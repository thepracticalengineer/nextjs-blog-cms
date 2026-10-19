// Run against the intended environment during the documented deployment handoff.
import { createClient } from '@supabase/supabase-js'
import { backfillPostMedia } from './lib/backfill-post-media.mjs'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server environment.')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const apply = process.argv.includes('--apply')
const result = await backfillPostMedia(db, { apply, onBatch: progress => console.log(JSON.stringify({ mode: 'progress', ...progress })) })
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }))
