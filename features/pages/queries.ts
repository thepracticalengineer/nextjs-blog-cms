import 'server-only'
import { createStaticClient } from '@/lib/supabase/static'
import { readPublishedSnapshot } from './published-snapshot'
import { pageValuesSchema, type PageSnapshot } from './schema'
import { pageFailure, type PageResult } from './errors'

/** Public renderers must use this validated snapshot, never a working page.
 * Paragraph text must be rendered as escaped text, never interpreted as HTML.
 * The anonymous client does not read cookies or require a request context.
 * No cache is introduced: publication consumers must design their invalidation.
 */
export async function getPublishedPage(slug: string): Promise<PageResult<PageSnapshot | null>> {
  if (!pageValuesSchema.shape.slug.safeParse(slug).success) return pageFailure('PAGE_INVALID_INPUT')
  try {
    const client = createStaticClient()
    if (!client) return pageFailure('PAGE_UNAVAILABLE')
    const { data, error } = await client.from('page_snapshots').select('*').eq('slug', slug).maybeSingle()
    if (error) return pageFailure('PAGE_UNAVAILABLE')
    if (!data) return { data: null, error: null }
    const result = readPublishedSnapshot(data)
    return result ? { data: result, error: null } : pageFailure('PAGE_UNSUPPORTED_DOCUMENT')
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
}
