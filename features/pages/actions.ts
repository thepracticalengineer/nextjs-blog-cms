'use server'

import { z } from 'zod'
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { pageDocumentImagesAllowed } from './document-server'
import { pageRecordSchema, pageWriteSchema, type Page } from './schema'
import { pageDatabaseFailure, pageFailure, type PageResult } from './errors'

/** Reuse a requestKey only for an exact retry, including expectedRevision. */
export async function writePage(input: unknown): Promise<PageResult<{ page: Page; replayed: boolean }>> {
  const parsed = pageWriteSchema.safeParse(input)
  if (!parsed.success) return pageFailure('PAGE_INVALID_INPUT')
  const request = parsed.data
  if ('values' in request && !pageDocumentImagesAllowed(request.values.document)) return pageFailure('PAGE_INVALID_INPUT')
  const permission = {
    create: 'pages:create', save: 'pages:update', publish: 'pages:publish', unpublish: 'pages:publish',
  } as const
  const { failure } = await authorizeSession(permission[request.operation])
  if (failure) return { data: null, error: { code: failure.code, message: failure.error } }
  const client = await createClient()
  try {
    const { data, error } = await client.rpc('write_page_atomic', {
      p_operation: request.operation,
      p_request_key: request.requestKey,
      p_values: 'values' in request ? request.values : null,
      p_page_id: 'pageId' in request ? request.pageId : null,
      p_expected_revision: 'expectedRevision' in request ? request.expectedRevision : null,
    })
    if (error) return pageDatabaseFailure(error)
    if (!data) return pageFailure('PAGE_UNAVAILABLE')
    const result = z.object({ page: pageRecordSchema, replayed: z.boolean() }).safeParse(data)
    if (!result.success || !pageDocumentImagesAllowed(result.data.page.document)) return pageFailure('PAGE_UNSUPPORTED_DOCUMENT')
    return { data: result.data, error: null }
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
}

export async function getPage(id: string): Promise<PageResult<Page | null>> {
  const { failure } = await authorizeSession('pages:read')
  if (failure) return { data: null, error: { code: failure.code, message: failure.error } }
  if (!z.uuid().safeParse(id).success) return pageFailure('PAGE_INVALID_INPUT')
  const client = await createClient()
  try {
    const { data, error } = await client.from('pages').select('*').eq('id', id).maybeSingle()
    if (error) return pageFailure('PAGE_UNAVAILABLE')
    if (!data) return { data: null, error: null }
    const result = pageRecordSchema.safeParse(data)
    return result.success && pageDocumentImagesAllowed(result.data.document) ? { data: result.data, error: null } : pageFailure('PAGE_UNSUPPORTED_DOCUMENT')
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
}
