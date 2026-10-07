'use server'

import { savePostAtomic } from './persistence'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { validatePublication, type FieldErrors } from './publication'
import { refreshPostPaths, refreshDraftPaths } from './cache'
import { planSlug, writeWithSlug, isSlugConflict, SLUG_CONFLICT, SLUG_CHANGE_CONFIRMATION } from './slugs'
import { cancelNewsletterSend, scheduleNewsletterSend } from '@/features/newsletter/actions'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { can } from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import { getProfile } from '@/lib/auth/session'
import type { PostFormValues, Post } from './types'
import type { PostNewsletterState } from '@/features/newsletter/types'
import { getPostNewsletterState } from '@/features/newsletter/queries'

type PostMutationResult = { data?: Post; error?: string; fieldErrors?: FieldErrors; newsletterWarning?: string; newsletterState?: PostNewsletterState }

export async function createPost(values: PostFormValues, editorId?: string, documentId?: string, publish = false): Promise<PostMutationResult> {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'posts:create')) {
    return { error: 'Unauthorized' }
  }

  if (publish && !can(profile.role as Role, 'posts:publish')) return { error: 'Unauthorized' }
  if (editorId !== undefined && profile.id !== editorId) return { error: 'The signed-in account changed. Sign in with the account that opened this editor; your input is preserved.' }
  const supabase = await createClient()
  if (documentId && !z.uuid().safeParse(documentId).success) return { error: 'Invalid draft identity.' }
  const actorId = profile.id
  async function existingDocumentError() {
    if (!documentId) return undefined
    const { data: existing } = await supabase.from('posts').select('id, author_id, status').eq('id', documentId).single()
    if (existing?.author_id !== actorId) return undefined
    return existing.status === 'published'
      ? 'This post was already published. Reload this editor to see the saved post and newsletter status, and compare your current writing before saving.'
      : 'This draft was already created. Reload this editor to compare your writing before saving.'
  }
  const existingError = await existingDocumentError()
  if (existingError) return { error: existingError }
  const plan = planSlug(values.slug, values.title, values.auto_slug)
  if (plan.error) return { error: plan.error, fieldErrors: { slug: [plan.error] } }

  let fieldErrors: FieldErrors = {}
  const result = await writeWithSlug<Post>(plan, async slug => {
    if (publish) {
      fieldErrors = await validatePublication(createServiceClient(), { ...values, slug, author_id: profile.id }, values.editorial_reviewed, undefined, plan.automatic)
      if (Object.keys(fieldErrors).length) return { data: null, error: { message: 'Publication blocked. Review the highlighted fields.' } }
    }
    const { data, error } = await savePostAtomic({ actorId: profile.id, postId: documentId,
      tagIds: values.tag_ids ?? [], payload: {
        title: values.title,
        slug,
        excerpt: values.excerpt || null,
        content: values.content || null,
        cover_image: values.cover_image || null,
        cover_image_alt: values.cover_image_alt?.trim().slice(0, 1000) ?? '',
        category_id: values.category_id || null,
        seo_title: values.seo_title || null,
        seo_description: values.seo_description || null,
        author_id: profile.id,
        status: publish ? 'published' : 'draft',
        ...(publish ? { published_at: new Date().toISOString() } : {}),
      },
    })
    return { data: data?.post ?? null, error }
  })
  const { data: post, error } = result

  if (error) {
    if (documentId) {
      const existingError = await existingDocumentError()
      if (existingError) return { error: existingError }
    }
    if (Object.keys(fieldErrors).length) return { error: error.message, fieldErrors }
    if (isSlugConflict(error)) return { error: SLUG_CONFLICT, fieldErrors: { slug: [SLUG_CONFLICT] } }
    return { error: error.message }
  }
  if (!post) return { error: 'The post could not be saved. Try again.' }

  let newsletterWarning: string | undefined
  if (publish) {
    try { await scheduleNewsletterSend(post.id, { resetPendingDelay: true }) } catch (err) {
      console.error('[createPost] Newsletter scheduling failed:', err)
      newsletterWarning = 'Post published, but newsletter scheduling could not be confirmed. Check newsletter status before retrying.'
    }
    refreshPostPaths(post.slug, post.slug)
  } else refreshDraftPaths()
  return { data: post, newsletterState: await getPostNewsletterState(post.id), ...(newsletterWarning ? { newsletterWarning } : {}) }
}

export async function updatePost(id: string, values: PostFormValues, publish = false, expectedUpdatedAt?: string | null, editorId?: string): Promise<PostMutationResult> {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (editorId !== undefined && profile.id !== editorId) return { error: 'The signed-in account changed. Sign in with the account that opened this editor; your input is preserved.' }

  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase.from('posts').select('*').eq('id', id).single()
  if (fetchError || !existing) return { error: 'Post not found' }
  if (profile.role !== 'admin' && existing.author_id !== profile.id) return { error: 'Unauthorized' }
  if (expectedUpdatedAt !== undefined && existing.updated_at !== expectedUpdatedAt) return { error: 'The post changed in another editor. Your writing is preserved; reopen to compare before saving.' }
  const targetPublished = publish || existing.status === 'published'
  if (targetPublished && !can(profile.role as Role, 'posts:publish')) return { error: 'Unauthorized' }
  const plan = planSlug(values.slug, values.title, false, existing.slug)
  if (plan.error) return { error: plan.error, fieldErrors: { slug: [plan.error] } }
  const slug = plan.slug
  if (existing.status === 'published' && slug !== existing.slug && values.confirm_slug_change !== true) {
    return { error: SLUG_CHANGE_CONFIRMATION, fieldErrors: { slug: [SLUG_CHANGE_CONFIRMATION] } }
  }
  if (targetPublished) {
    const fieldErrors = await validatePublication(createServiceClient(), { ...values, slug, author_id: existing.author_id }, values.editorial_reviewed, id)
    if (Object.keys(fieldErrors).length) return { error: 'Publication blocked. Review the highlighted fields.', fieldErrors }
  }

  const { data: saved, error } = await savePostAtomic({ actorId: profile.id, postId: id,
    expectedUpdatedAt: existing.updated_at, expectedStatus: existing.status, allowAdmin: true,
    tagIds: values.tag_ids ?? [], payload: {
      ...(publish ? { status: 'published', published_at: existing.published_at || new Date().toISOString() } : {}),
      title: values.title,
      slug,
      excerpt: values.excerpt || null,
      content: values.content || null,
      cover_image: values.cover_image || null,
      cover_image_alt: values.cover_image_alt?.trim().slice(0, 1000) ?? '',
      category_id: values.category_id || null,
      seo_title: values.seo_title || null,
      seo_description: values.seo_description || null,
    } })
  const post = saved?.post

  if (isSlugConflict(error)) return { error: SLUG_CONFLICT, fieldErrors: { slug: [SLUG_CONFLICT] } }
  if (error?.code === '23514' && error.message.includes('abandoned image')) return { error: error.message }
  if (error || !post) return { error: error?.code === '40001' ? 'The post changed. Your input is preserved; reload before trying again.' : 'The post and tags could not be saved. No changes were applied. Try again.' }

  let newsletterWarning: string | undefined
  if (publish && existing.status !== 'published') {
    try { await scheduleNewsletterSend(id, { resetPendingDelay: true }) } catch (err) {
      console.error('[updatePost] Newsletter scheduling failed:', err)
      newsletterWarning = 'Post published, but newsletter scheduling could not be confirmed. Check the newsletter status and retry scheduling if available.'
    }
  }
  if (targetPublished) refreshPostPaths(existing.slug, slug)
  else refreshDraftPaths()
  return { data: post, newsletterState: await getPostNewsletterState(post.id), ...(newsletterWarning ? { newsletterWarning } : {}) }
}

export async function publishPost(id: string, values: PostFormValues, expectedUpdatedAt?: string | null, editorId?: string) {
  // Save and publish in one checked write. Never save draft input over live
  // content before learning whether publication validation succeeds.
  return updatePost(id, values, true, expectedUpdatedAt, editorId)
}

export async function unpublishPost(id: string, editorId?: string): Promise<PostMutationResult> {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'posts:publish')) {
    return { error: 'Unauthorized' }
  }

  if (editorId !== undefined && profile.id !== editorId) return { error: 'The signed-in account changed. Sign in with the account that opened this editor; your input is preserved.' }
  const supabase = await createClient()
  const { data: post, error } = await supabase
    .from('posts')
    .update({ status: 'draft', published_at: null })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }

  let newsletterWarning: string | undefined
  try { await cancelNewsletterSend(id) } catch (err) {
    console.error('[unpublishPost] Newsletter cancellation failed:', err)
    newsletterWarning = 'Post unpublished, but newsletter cancellation could not be confirmed. Delivery checks will block new batches while the post is unpublished. Refresh newsletter status before republishing.'
  }
  refreshPostPaths(post.slug)
  return { data: post, newsletterState: await getPostNewsletterState(post.id), ...(newsletterWarning ? { newsletterWarning } : {}) }
}

export async function retryNewsletterScheduling(id: string, editorId?: string): Promise<{ error?: string }> {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'posts:publish')) return { error: 'Unauthorized' }
  if (editorId !== undefined && profile.id !== editorId) return { error: 'The signed-in account changed. Sign in with the account that opened this editor.' }
  const supabase = await createClient()
  const { data: post, error } = await supabase.from('posts').select('author_id, status').eq('id', id).single()
  if (error || !post) return { error: 'Post not found' }
  if (profile.role !== 'admin' && post.author_id !== profile.id) return { error: 'Unauthorized' }
  if (post.status !== 'published') return { error: 'Publish this post before scheduling its newsletter.' }
  const state = await getPostNewsletterState(id)
  if (state.error) return { error: state.error }
  if (state.send && (state.send.status !== 'failed' || state.send.delivery_started_at || state.send.sent_at)) {
    return { error: 'This newsletter is already queued or delivery has started. It will not be restarted to avoid duplicate emails.' }
  }
  try {
    // The unique post_id and conditional restore also guard concurrent retries.
    await scheduleNewsletterSend(id)
    return {}
  } catch (err) {
    console.error('[retryNewsletterScheduling] Scheduling failed:', err)
    return { error: 'Newsletter scheduling could not be confirmed. Refresh status and try again. The post remains published.' }
  }
}

export async function deletePost(id: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }

  const supabase = await createClient()

  if (profile.role !== 'admin') {
    const { data: existing } = await supabase
      .from('posts')
      .select('author_id')
      .eq('id', id)
      .single()

    if (existing?.author_id !== profile.id) {
      return { error: 'Unauthorized' }
    }
  }

  const { error } = await supabase.from('posts').delete().eq('id', id)
  if (error) return { error: error.message }

  refreshPostPaths()
  redirect('/dashboard/posts')
}
