import { createHash } from 'node:crypto'

const pending = db => db.from('post_media').select('path', { count: 'exact' })
  .eq('state', 'active').is('content_sha256', null).is('hash_checked_at', null)

/** Offline deployment task: never runs inside the upload request. Safe to resume. */
export async function backfillPostMedia(db, { apply = false, onBatch = () => {} } = {}) {
  const { count, error } = await pending(db).limit(0)
  if (error) throw new Error('Unable to read the legacy image index.')
  const totals = { pending: count ?? 0, hashed: 0, missing: 0 }
  if (!apply) return totals
  while (true) {
    const { data, error: readError } = await pending(db).order('path').limit(50)
    if (readError) throw new Error('Unable to read the legacy image index.')
    if (!data?.length) return { ...totals, pending: 0 }
    for (const media of data) {
      const { data: object, error: downloadError } = await db.storage.from('post-media').download(media.path)
      const missing = !!downloadError && (downloadError.statusCode === '404' || downloadError.code === 'NoSuchKey')
      if ((downloadError && !missing) || (!object && !missing)) throw new Error(`Unable to download legacy image ${media.path}. Retry this command to resume.`)
      const values = { hash_checked_at: new Date().toISOString() }
      if (!missing) values.content_sha256 = createHash('sha256').update(Buffer.from(await object.arrayBuffer())).digest('hex')
      const { error: updateError } = await db.from('post_media').update(values).eq('path', media.path).is('content_sha256', null)
      if (updateError) throw new Error(`Unable to index legacy image ${media.path}. Retry this command to resume.`)
      totals[missing ? 'missing' : 'hashed']++
      totals.pending = Math.max(0, totals.pending - 1)
    }
    onBatch({ ...totals })
  }
}
