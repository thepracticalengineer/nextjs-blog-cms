'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { findDisallowedPageImage } from './document-server'
import { pageRecordSchema, pageWriteSchema, type Page } from './schema'
import { pageDatabaseFailure, pageFailure, pageImageFailure, type PageResult } from './errors'

/** Reuse a requestKey only for an exact retry, including expectedRevision. */
export async function writePage(input: unknown, expectedAccountId?: string): Promise<PageResult<{ page: Page; replayed: boolean }>> {
  const parsed = pageWriteSchema.safeParse(input)
  if (!parsed.success) return pageFailure('PAGE_INVALID_INPUT')
  const request = parsed.data
  const permission = {
    create: 'pages:create', save: 'pages:update', publish: 'pages:publish', unpublish: 'pages:publish',
  } as const
  const { profile, failure } = await authorizeSession(permission[request.operation])
  if (failure) return { data: null, error: { code: failure.code, message: failure.error, writeAttempted: false } }
  if (expectedAccountId && profile.id !== expectedAccountId) {
    const rejected = pageFailure('PAGE_FORBIDDEN')
    return { ...rejected, error: { ...rejected.error, writeAttempted: false } }
  }
  const inputImage = 'values' in request ? findDisallowedPageImage(request.values.document) : null
  if (inputImage) {
    const rejected = pageImageFailure(inputImage)
    return { ...rejected, error: { ...rejected.error, writeAttempted: false } }
  }
  const client = await createClient()
  // SQL cannot see the deployment's image allowlist. Read after authorization;
  // a concurrent save is rejected by the RPC's locked expectedRevision check.
  if (request.operation === 'publish') {
    const working = await readAuthorizedPage(client, request.pageId)
    if (working.error) return { ...working, error: { ...working.error, writeAttempted: false } }
    if (!working.data) return pageFailure('PAGE_NOT_FOUND')
  }
  try {
    const { data, error } = await client.rpc('write_page_atomic', {
      p_operation: request.operation,
      p_reviewed: request.operation === 'publish' && request.reviewed,
      p_confirm_url_change: request.operation === 'publish' && request.confirmUrlChange === true,
      p_request_key: request.requestKey,
      p_values: 'values' in request ? request.values : null,
      p_page_id: 'pageId' in request ? request.pageId : null,
      p_expected_revision: 'expectedRevision' in request ? request.expectedRevision : null,
    })
    if (error) return pageDatabaseFailure(error)
    if (!data) return pageFailure('PAGE_UNAVAILABLE')
    const result = readWriteResponse(data)
    if (!result.error) {
      revalidatePath('/dashboard/pages')
      if (request.operation === 'publish' || request.operation === 'unpublish') {
        // Includes every historical alias, even on an exact retry after a lost response.
        revalidatePath('/[slug]', 'page')
        revalidatePath('/sitemap.xml')
      }
    }
    return result
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
}

export async function getPage(id: string): Promise<PageResult<Page | null>> {
  const { failure } = await authorizeSession('pages:read')
  if (failure) return { data: null, error: { code: failure.code, message: failure.error } }
  if (!z.uuid().safeParse(id).success) return pageFailure('PAGE_INVALID_INPUT')
  return readAuthorizedPage(await createClient(), id)
}

async function readAuthorizedPage(client: Awaited<ReturnType<typeof createClient>>, id: string): Promise<PageResult<Page | null>> {
  try {
    const { data, error } = await client.from('pages').select('*').eq('id', id).maybeSingle()
    if (error) return pageFailure('PAGE_UNAVAILABLE')
    if (!data) return { data: null, error: null }
    const result = pageRecordSchema.safeParse(data)
    if (!result.success) return pageFailure('PAGE_UNSUPPORTED_DOCUMENT')
    const image = findDisallowedPageImage(result.data.document)
    return image ? pageImageFailure(image) : { data: result.data, error: null }
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
}

function readWriteResponse(data: unknown): PageResult<{ page: Page; replayed: boolean }> {
  const result = z.object({ page: pageRecordSchema, replayed: z.boolean() }).safeParse(data)
  if (!result.success) return pageFailure('PAGE_UNSUPPORTED_DOCUMENT')
  const image = findDisallowedPageImage(result.data.page.document)
  if (image) return pageImageFailure(image)
  return { data: result.data, error: null }
}
