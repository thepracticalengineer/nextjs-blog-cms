import crypto from 'crypto'
import slugify from 'slugify'
import { createServiceClient } from '@/lib/supabase/service'
import type { ApiKeyListItem, CreateApiKeyResult } from './types'

export function generateApiKey(): string {
  const bytes = crypto.randomBytes(32)
  return `fmblog_${bytes.toString('hex')}`
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export async function createApiKey(
  name: string,
  userId: string
): Promise<CreateApiKeyResult> {
  const rawKey = generateApiKey()
  const keyHash = hashApiKey(rawKey)
  const keyPreview = `fmblog_...${rawKey.slice(-4)}`

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .insert({ name, key_hash: keyHash, key_preview: keyPreview, user_id: userId })
    .select('id, name, key_preview, user_id, created_at, last_used_at, is_active')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create key')

  return { key: data as ApiKeyListItem, rawKey }
}

export async function listApiKeys(userId: string): Promise<ApiKeyListItem[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_preview, user_id, created_at, last_used_at, is_active')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ApiKeyListItem[]
}

export async function revokeApiKey(id: string, userId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

export async function deleteApiKey(id: string, userId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

export async function validateApiKey(rawKey: string): Promise<string | null> {
  const hash = hashApiKey(rawKey)
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active')
    .eq('key_hash', hash)
    .single()

  if (error || !data || !data.is_active) return null

  const { error: updateError } = await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  if (updateError) {
    console.error('Failed to update api_keys.last_used_at during API key validation', {
      apiKeyId: data.id,
      error: updateError.message,
    })
  }

  return data.user_id
}

export async function resolveTagIds(
  tagNames: string[],
  supabase: ReturnType<typeof createServiceClient>
): Promise<string[]> {
  const ids: string[] = []

  for (const name of tagNames) {
    const slug = slugify(name, { lower: true, strict: true })

    const { data: existing } = await supabase
      .from('tags')
      .select('id, merged_into')
      .eq('slug', slug)
      .single()

    if (existing) {
      ids.push(existing.merged_into ?? existing.id)
    } else {
      const { data: created, error } = await supabase
        .from('tags')
        .insert({ name, slug })
        .select('id, merged_into')
        .single()

      if (!error && created) ids.push(created.merged_into ?? created.id)
    }
  }

  return [...new Set(ids)]
}

export async function resolveCategoryId(
  category: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<string | null> {
  const slug = slugify(category, { lower: true, strict: true })

  // Try slug match first
  const { data: bySlug } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .single()

  if (bySlug) return bySlug.id

  // Fallback: case-insensitive name match
  const { data: byName } = await supabase
    .from('categories')
    .select('id')
    .ilike('name', category)
    .single()

  return byName?.id ?? null
}
