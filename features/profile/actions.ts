'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/session'
import { z } from 'zod'
import type { ProfileFormData, SocialLinksFormData } from './types'

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable().optional()
const publicUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}, 'Use a valid HTTP or HTTPS URL without credentials').transform((value) => value || null).nullable().optional()

const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(120).nullable().optional(),
  pronouns: optionalText(100), bio: optionalText(2000),
  company: optionalText(200), location: optionalText(200), website: publicUrl,
  twitter_url: publicUrl, linkedin_url: publicUrl, github_url: publicUrl,
  instagram_url: publicUrl, facebook_url: publicUrl, youtube_url: publicUrl, tiktok_url: publicUrl,
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field')

function revalidatePublicProfile(id: string) {
  revalidatePath('/dashboard/profile')
  revalidatePath(`/authors/${id}`)
  revalidatePath('/blog', 'layout')
  revalidatePath('/')
}

export async function updateProfile(data: Partial<{ [K in keyof (ProfileFormData & SocialLinksFormData)]: string | null }>) {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }

  const parsed = profileUpdateSchema.safeParse(data)
  if (!parsed.success) return { error: 'Invalid profile information. Check field lengths and use HTTP or HTTPS links.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', profile.id)

  if (error) return { error: error.message }

  revalidatePublicProfile(profile.id)
  return { success: true }
}

export async function updateAvatar(formData: FormData) {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }

  const file = formData.get('avatar') as File
  if (!file || file.size === 0) return { error: 'No file provided' }
  if (file.size > 2 * 1024 * 1024) return { error: 'File too large (max 2 MB)' }

  const ALLOWED_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
  }

  if (!ALLOWED_TYPES[file.type]) return { error: 'Invalid file type. Use JPG, PNG, or GIF.' }
  const ext = ALLOWED_TYPES[file.type]
  const path = `${profile.id}/avatar.${ext}`

  const supabase = await createClient()
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true })

  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(path)

  // Append a version query param so re-uploads of the same filename bust the browser cache
  const versionedUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: versionedUrl })
    .eq('id', profile.id)

  if (updateError) return { error: updateError.message }

  revalidatePublicProfile(profile.id)
  return { success: true, avatar_url: versionedUrl }
}

export async function deleteAvatar() {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }

  if (!profile.avatar_url) return { success: true }

  const supabase = await createClient()

  // List all files under the user's folder and remove them all.
  // This handles any extension (jpg/png/gif) without fragile URL parsing.
  const { data: listed, error: listError } = await supabase.storage.from('avatars').list(profile.id)
  if (listError) return { error: listError.message }
  if (listed && listed.length > 0) {
    const paths = listed.map((f) => `${profile.id}/${f.name}`)
    const { error: removeError } = await supabase.storage.from('avatars').remove(paths)
    if (removeError) return { error: removeError.message }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', profile.id)

  if (error) return { error: error.message }

  revalidatePublicProfile(profile.id)
  return { success: true }
}

export async function updatePassword(currentPassword: string, newPassword: string) {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }

  // Use a stateless client (no cookie writes) to verify the current password
  // so re-authentication does not mutate the caller's session cookies.
  const anonClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error: signInError } = await anonClient.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  })
  if (signInError) {
    // Use structured error code to distinguish credential failures from
    // infrastructure/rate-limit errors, avoiding brittle string matching.
    const isInvalidCredentials =
      signInError.code === 'invalid_credentials' ||
      (signInError.code == null && signInError.status === 400)
    return { error: isInvalidCredentials ? 'Current password is incorrect' : signInError.message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }

  return { success: true }
}
