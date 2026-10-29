import 'server-only'
import { cache } from 'react'
import { createStaticClient } from '@/lib/supabase/static'
import { publicPageMetadata } from '@/lib/metadata'
import { pageDocumentImagesAllowed } from './document-server'
import { pageSnapshotSchema, type PageSnapshot } from './schema'
import { normalizePagePath } from './urls'

/** Request-local deduplication keeps HTML and metadata on the same snapshot.
 * The route is dynamic: no cross-request cache may retain withdrawn snapshots.
 */
export const resolvePublicPage = cache(async (path: string): Promise<PageSnapshot | null> => {
  const slug = normalizePagePath(path)
  if (!slug) return null
  const client = createStaticClient()
  if (!client) throw new Error('Public pages unavailable')
  const { data, error } = await client.rpc('resolve_page_path', { p_slug: slug })
  if (error) throw new Error('Public pages unavailable')
  if (!data) return null
  const result = pageSnapshotSchema.safeParse(data)
  return result.success && pageDocumentImagesAllowed(result.data.document) ? result.data : null
})

export function publishedPageMetadata(page: PageSnapshot) {
  const metadata = publicPageMetadata(`/${page.slug}`, page.seo_title || page.title, page.seo_description)
  // Explicit null overrides the root layout's default description.
  if (!page.seo_description) {
    metadata.description = null
    if (metadata.openGraph) metadata.openGraph.description = undefined
    if (metadata.twitter) metadata.twitter.description = undefined
  }
  return metadata
}
