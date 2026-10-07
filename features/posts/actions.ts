'use server'

import { redirect } from 'next/navigation'
import slugify from 'slugify'
import { randomUUID } from 'crypto'
import { validatePublication, type FieldErrors } from './publication'
import { refreshPostPaths, refreshDraftPaths } from './cache'
import { cancelNewsletterSend } from '@/features/newsletter/actions'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { can } from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import { getProfile } from '@/lib/auth/session'
import type { PostFormValues, Post } from './types'

type PostMutationResult = { data?: Post; error?: string; fieldErrors?: FieldErrors }
import { scheduleNewsletterSend } from '@/features/newsletter/actions'

async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const supabase = await createClient()
  const base = slugify(title, { lower: true, strict: true }) || `draft-${randomUUID()}`
  let slug = base
  let counter = 2

  while (true) {
    let query = supabase.from('posts').select('id').eq('slug', slug)
    if (excludeId) query = query.neq('id', excludeId)
    const { data } = await query
    if (!data || data.length === 0) break
    slug = `${base}-${counter}`
    counter++
  }

  return slug
}

export async function createPost(values: PostFormValues): Promise<PostMutationResult> {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'posts:create')) {
    return { error: 'Unauthorized' }
  }

  const supabase = await createClient()
  const slug = values.slug || await generateUniqueSlug(values.title)

  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      title: values.title,
      slug,
      excerpt: values.excerpt || null,
      content: values.content || null,
      cover_image: values.cover_image || null,
      category_id: values.category_id || null,
      seo_title: values.seo_title || null,
      seo_description: values.seo_description || null,
      author_id: profile.id,
      status: 'draft',
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Handle tags
  if (values.tag_ids?.length > 0) {
    await supabase.from('post_tags').insert(
      values.tag_ids.map((tag_id) => ({ post_id: post.id, tag_id }))
    )
  }

  refreshDraftPaths()
  return { data: post }
}

export async function updatePost(id: string, values: PostFormValues, publish = false): Promise<PostMutationResult> {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }

  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase.from('posts').select('*').eq('id', id).single()
  if (fetchError || !existing) return { error: 'Post not found' }
  if (profile.role !== 'admin' && existing.author_id !== profile.id) return { error: 'Unauthorized' }
  const targetPublished = publish || existing.status === 'published'
  if (targetPublished && !can(profile.role as Role, 'posts:publish')) return { error: 'Unauthorized' }
  const slug = values.slug || await generateUniqueSlug(values.title, id)
  if (targetPublished) {
    const fieldErrors = await validatePublication(createServiceClient(), { ...values, slug, author_id: existing.author_id }, values.editorial_reviewed, id)
    if (Object.keys(fieldErrors).length) return { error: 'Publication blocked. Review the highlighted fields.', fieldErrors }
  }

  const { data: post, error } = await supabase
    .from('posts')
    .update({
      ...(publish ? { status: 'published', published_at: existing.published_at || new Date().toISOString() } : {}),
      title: values.title,
      slug,
      excerpt: values.excerpt || null,
      content: values.content || null,
      cover_image: values.cover_image || null,
      category_id: values.category_id || null,
      seo_title: values.seo_title || null,
      seo_description: values.seo_description || null,
    })
    .eq('id', id)
    .eq('updated_at', existing.updated_at)
    .eq('status', existing.status)
    .select()
    .single()

  if (error || !post) return { error: 'The post changed or could not be saved. Your input is preserved; reload before trying again.' }

  // Replace tags
  await supabase.from('post_tags').delete().eq('post_id', id)
  if (values.tag_ids?.length > 0) {
    await supabase.from('post_tags').insert(
      values.tag_ids.map((tag_id) => ({ post_id: id, tag_id }))
    )
  }

  if (publish && existing.status !== 'published') {
    try { await scheduleNewsletterSend(id) } catch (err) { console.error('[updatePost] Newsletter scheduling failed:', err) }
  }
  if (targetPublished) refreshPostPaths(existing.slug, slug)
  else refreshDraftPaths()
  return { data: post }
}

export async function publishPost(id: string, values: PostFormValues) {
  // Save and publish in one checked write. Never save draft input over live
  // content before learning whether publication validation succeeds.
  return updatePost(id, values, true)
}

export async function unpublishPost(id: string) {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'posts:publish')) {
    return { error: 'Unauthorized' }
  }

  const supabase = await createClient()
  const { data: post, error } = await supabase
    .from('posts')
    .update({ status: 'draft', published_at: null })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }

  await cancelNewsletterSend(id)
  refreshPostPaths(post.slug)
  return { data: post }
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
