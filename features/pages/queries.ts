import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { pageSnapshotSchema, pageValuesSchema, type PageSnapshot } from './schema'
import { pageFailure, type PageResult } from './errors'

/** The future renderer must use this validated snapshot, never a working page.
 * Paragraph text must be rendered as escaped text, never interpreted as HTML.
 * No cache is introduced: publication consumers must design their invalidation.
 */
export async function getPublishedPage(slug: string): Promise<PageResult<PageSnapshot | null>> {
  if (!pageValuesSchema.shape.slug.safeParse(slug).success) return pageFailure('PAGE_INVALID_INPUT')
  const client = await createClient()
  try {
    const { data, error } = await client.from('page_snapshots').select('*').eq('slug', slug).maybeSingle()
    if (error) return pageFailure('PAGE_UNAVAILABLE')
    if (!data) return { data: null, error: null }
    const result = pageSnapshotSchema.safeParse(data)
    return result.success ? { data: result.data, error: null } : pageFailure('PAGE_UNSUPPORTED_DOCUMENT')
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
}
