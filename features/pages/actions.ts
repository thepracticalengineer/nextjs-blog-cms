'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { authorizeSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { findDisallowedPageImage } from './document-server'
import { pageRecordSchema, pageRevisionSchema, pageRevisionSummarySchema, pageWriteSchema, type Page, type PageRevision, type PageRevisionSummary } from './schema'
import { pageDatabaseFailure, pageFailure, pageImageFailure, type PageResult } from './errors'

/** Reuse a requestKey only for an exact retry, including expectedRevision. */
export async function writePage(input: unknown, expectedAccountId?: string): Promise<PageResult<{ page: Page; replayed: boolean }>> {
  const parsed = pageWriteSchema.safeParse(input)
  if (!parsed.success) return pageFailure('PAGE_INVALID_INPUT')
  const request = parsed.data
  const permission = {
    create: 'pages:create', save: 'pages:update', publish: 'pages:publish', unpublish: 'pages:publish', restore: 'pages:update',
    trash: 'pages:publish', recover: 'pages:update', purge: 'pages:publish', move: 'pages:update',
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
  // A restored revision may reference an image host that is no longer configured.
  if (request.operation === 'restore') {
    const source = await readAuthorizedRevision(client, request.pageId, request.sourceRevision)
    if (source.error) return { ...source, error: { ...source.error, writeAttempted: false } }
    if (!source.data) {
      const missing = pageFailure('PAGE_REVISION_NOT_FOUND')
      return { ...missing, error: { ...missing.error, writeAttempted: false } }
    }
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
      p_source_revision: request.operation === 'restore' ? request.sourceRevision : null,
      p_options: request.operation === 'move' ? { parent_id: request.parentId, position: request.position }
        : request.operation === 'purge' ? { confirm_slug: request.confirmSlug } : null,
    })
    if (error) return pageDatabaseFailure(error)
    if (!data) return pageFailure('PAGE_UNAVAILABLE')
    const result = readWriteResponse(data)
    if (!result.error) {
      revalidatePath('/dashboard/pages')
      if (['publish', 'unpublish', 'trash', 'purge'].includes(request.operation)) {
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

const treeNode = z.object({ id: z.uuid(), title: z.string(), slug: z.string(), parent_id: z.uuid().nullable(), position: z.number().int() })
export type PageTreeNode = z.infer<typeof treeNode>
/** Active (not trashed) pages for parent selection, ordered for tree display. The database enforces every hierarchy rule. */
export async function listPageTree(): Promise<PageResult<PageTreeNode[]>> {
  const { failure } = await authorizeSession('pages:read')
  if (failure) return { data: null, error: { code: failure.code, message: failure.error } }
  try {
    const client = await createClient()
    const { data, error } = await client.from('pages').select('id,title,slug,parent_id,position').is('trashed_at', null).order('position').order('id').limit(1000)
    if (error) return pageFailure('PAGE_UNAVAILABLE')
    const result = z.array(treeNode).safeParse(data)
    return result.success ? { data: result.data, error: null } : pageFailure('PAGE_UNAVAILABLE')
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
}

/** Newest first, without documents. Private to page administrators. */
export async function listPageRevisions(pageId: string): Promise<PageResult<PageRevisionSummary[]>> {
  const { failure } = await authorizeSession('pages:read')
  if (failure) return { data: null, error: { code: failure.code, message: failure.error } }
  if (!z.uuid().safeParse(pageId).success) return pageFailure('PAGE_INVALID_INPUT')
  try {
    const client = await createClient()
    const { data, error } = await client.rpc('list_page_revisions', { p_page_id: pageId, p_limit: 50 })
    if (error) return pageDatabaseFailure(error)
    const result = z.array(pageRevisionSummarySchema).safeParse(data)
    return result.success ? { data: result.data, error: null } : pageFailure('PAGE_UNAVAILABLE')
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
}

export async function getPageRevision(pageId: string, revision: string): Promise<PageResult<PageRevision | null>> {
  const { failure } = await authorizeSession('pages:read')
  if (failure) return { data: null, error: { code: failure.code, message: failure.error } }
  if (!z.uuid().safeParse(pageId).success || !z.uuid().safeParse(revision).success) return pageFailure('PAGE_INVALID_INPUT')
  return readAuthorizedRevision(await createClient(), pageId, revision)
}

async function readAuthorizedRevision(client: Awaited<ReturnType<typeof createClient>>, pageId: string, revision: string): Promise<PageResult<PageRevision | null>> {
  try {
    const { data, error } = await client.from('page_revisions').select('*').eq('page_id', pageId).eq('revision', revision).maybeSingle()
    if (error) return pageFailure('PAGE_UNAVAILABLE')
    if (!data) return { data: null, error: null }
    const result = pageRevisionSchema.safeParse(data)
    if (!result.success) return pageFailure('PAGE_UNSUPPORTED_DOCUMENT')
    const image = findDisallowedPageImage(result.data.document)
    return image ? pageImageFailure(image) : { data: result.data, error: null }
  } catch {
    return pageFailure('PAGE_UNAVAILABLE')
  }
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
