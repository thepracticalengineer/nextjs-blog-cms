'use server'

import { authAbuseBlock } from '@/lib/auth/abuse'
import { providerCooldown } from '@/lib/auth/abuse-feedback'

import { revalidatePath } from 'next/cache'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/session'
import { passwordChangeSchema } from '@/lib/auth/password-policy'
import { profileUpdateSchema } from './validation'
import type { ProfileFormData, SocialLinksFormData, PasswordChangeResult } from './types'

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

async function sendPasswordVerification(supabase: Awaited<ReturnType<typeof createClient>>, accountId: string, reserved = false): Promise<PasswordChangeResult> {
  try {
    const blocked = reserved ? null : await authAbuseBlock('reauthentication', accountId)
    if (blocked) return { ...blocked, reauthenticationRequired: true }
    const { error } = await supabase.auth.reauthenticate()
    if (error) return {
      reauthenticationRequired: true,
      ...(providerCooldown(error) ?? { error: 'Unable to send a verification code. Please try again.' }),
    }
    return { reauthenticationRequired: true, codeSent: true }
  } catch (error) {
    return { reauthenticationRequired: true, ...(providerCooldown(error) ?? { error: 'Unable to send a verification code. Please try again.' }) }
  }
}

export async function requestPasswordReauthentication(): Promise<PasswordChangeResult> {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }
  const blocked = await authAbuseBlock('reauthentication', profile.id)
  if (blocked) return { ...blocked, reauthenticationRequired: true }
  const supabase = await createClient()
  return sendPasswordVerification(supabase, profile.id, true)
}

export async function updatePassword(currentPassword: unknown, newPassword: unknown, nonce?: unknown): Promise<PasswordChangeResult> {
  const profile = await getProfile()
  if (!profile) return { error: 'Unauthorized' }

  const parsed = passwordChangeSchema.safeParse({ currentPassword, newPassword, nonce })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const blocked = await authAbuseBlock('password', profile.id)
  if (blocked) return blocked

  // Verify legacy passwords without changing the caller's cookies or replacing
  // an AAL2 session with the AAL1 session created by password sign-in.
  const anonClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const supabase = await createClient()
  try {
    const { error: signInError } = await anonClient.auth.signInWithPassword({
      email: profile.email,
      password: parsed.data.currentPassword,
    })
    if (signInError) {
      const isInvalidCredentials =
        signInError.code === 'invalid_credentials' ||
        (signInError.code == null && signInError.status === 400)
      return providerCooldown(signInError) ?? { error: isInvalidCredentials ? 'Current password is incorrect' : 'Unable to verify your current password. Please try again.' }
    }

    // Password verification creates a real refresh session even with persistence
    // disabled. Revoke only that temporary session, never the caller's AAL2
    // session. Cleanup outages must not report valid credentials as incorrect.
    try {
      await anonClient.auth.signOut({ scope: 'local' })
    } catch {
      // Leave the original session untouched if Auth cleanup is unavailable.
    }

    // Auth decides whether the original session qualifies for its 24-hour
    // exception. A separate password sign-in is not provider reauthentication.
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.newPassword,
      ...(parsed.data.nonce === undefined ? {} : { nonce: parsed.data.nonce }),
    })
    if (error?.code === 'reauthentication_needed') return await sendPasswordVerification(supabase, profile.id)
    if (error?.code === 'reauthentication_not_valid') return {
      reauthenticationRequired: true,
      error: 'That verification code is invalid or expired. Try again or request a new code.',
    }
    if (error) return providerCooldown(error) ?? { error: 'Unable to update your password right now. Please try again.' }
    return { success: true }
  } catch (error) {
    return providerCooldown(error) ?? { error: 'Unable to update your password right now. Please try again.' }
  }
}
