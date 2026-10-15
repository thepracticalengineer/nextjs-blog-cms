'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { credentialFields, signupSchema } from '@/lib/auth/credentials'
import { credentialErrorMessage } from '@/lib/auth/credential-errors'
import { signupCallbackUrl } from '@/lib/auth/confirmation'

export async function register(formData: FormData) {
  const parsed = signupSchema.safeParse(credentialFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  let emailRedirectTo: string
  try {
    emailRedirectTo = signupCallbackUrl()
  } catch {
    return { error: 'Signup is temporarily unavailable. Please try again later.' }
  }

  try {
    const supabase = await createClient()
    const { email, password, full_name } = parsed.data
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name }, emailRedirectTo },
    })
    if (error) return { error: credentialErrorMessage(error, 'signup') }
    if (!data.session) return { needsConfirmation: true }
  } catch (error) {
    return { error: credentialErrorMessage(error, 'signup', true) }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
