'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/session'
import { profileUpdateSchema } from './validation'
import type { ProfileFormData, SocialLinksFormData } from './types'

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
  if (!parsed.success) return {
    error: 'Check the highlighted profile fields and try again.',
    fieldErrors: parsed.error.flatten().fieldErrors,
  }

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
