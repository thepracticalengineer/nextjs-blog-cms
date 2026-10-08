'use server'

import { revalidatePath } from 'next/cache'
import slugify from 'slugify'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { can } from '@/lib/permissions'
import type { Role } from '@/lib/permissions'
import { getProfile } from '@/lib/auth/session'

async function requireCategoryAdmin() {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'categories:write')) return null
  return profile
}

export async function createCategory(formData: FormData) {
  const profile = await requireCategoryAdmin()
  if (!profile) return { error: 'Unauthorized' }

  const supabase = await createClient()
  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const slug = slugify(name, { lower: true, strict: true })

  const { data, error } = await supabase
    .from('categories')
    .insert({ name, slug, description: description || null })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/categories')
  return { success: true, category: data }
}

export async function deleteCategory(id: string) {
  const profile = await requireCategoryAdmin()
  if (!profile) return { error: 'Unauthorized' }

  const supabase = await createClient()

  const { count } = await supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('category_id', id)

  if (count && count > 0) {
    return { error: `Cannot delete: ${count} post(s) assigned to this category` }
  }

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/categories')
  return { success: true }
}

export async function createTag(formData: FormData) {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'tags:write')) return { error: 'Unauthorized' }

  const supabase = await createClient()
  const rawName = formData.get('name')
  if (typeof rawName !== 'string') return { error: 'Enter a tag name' }
  const name = rawName.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 100) return { error: 'Tag names must contain 1 to 100 characters' }
  const slug = slugify(name, { lower: true, strict: true })

  if (!slug) return { error: 'Tag names must contain letters or numbers' }
  const { data, error } = await supabase
    .from('tags')
    .insert({ name, slug })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/tags')
  return { success: true, tag: data }
}

export async function deleteTag(id: string) {
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'tags:write')) return { error: 'Unauthorized' }

  const supabase = await createClient()
  const { error } = await supabase.from('tags').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/admin/tags')
  return { success: true }
}

export async function mergeTags(sourceId: string, targetId: string) {
  if (!z.uuid().safeParse(sourceId).success || !z.uuid().safeParse(targetId).success || sourceId === targetId) return { error: 'Choose two different tags' }
  const profile = await getProfile()
  if (!profile || !can(profile.role as Role, 'tags:write')) return { error: 'Unauthorized' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('merge_tags', { source_id: sourceId, target_id: targetId })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/admin/tags')
  revalidatePath('/blog', 'layout')
  return { success: true }
}
