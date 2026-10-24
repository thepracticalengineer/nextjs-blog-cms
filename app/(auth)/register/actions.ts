'use server'

import type { AuthActionResult } from '@/lib/auth/abuse-feedback'
import { authAbuseBlock } from '@/lib/auth/abuse'
import { providerCooldown } from '@/lib/auth/abuse-feedback'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { credentialFields, signupSchema } from '@/lib/auth/credentials'
import { credentialErrorMessage } from '@/lib/auth/credential-errors'
import { signSignupReturn } from '@/features/onboarding/confirmation-return'
import { signupCallbackUrl } from '@/lib/auth/confirmation'

export async function register(formData: FormData): Promise<AuthActionResult> {
  const parsed = signupSchema.safeParse(credentialFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  let emailRedirectTo: string
  try {
    emailRedirectTo = signupCallbackUrl()
  } catch {
    return { error: 'Signup is temporarily unavailable. Please try again later.' }
  }

  try {
    const blocked = await authAbuseBlock('signup', parsed.data.email, formData.get('captchaToken'))
    if (blocked) return blocked
    const supabase = await createClient()
    const { email, password, full_name } = parsed.data
    const signupReturn = signSignupReturn(formData.get('next'), email)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, ...(signupReturn ? { signup_return: signupReturn } : {}) }, emailRedirectTo },
    })
    if (error) return providerCooldown(error) ?? { error: credentialErrorMessage(error, 'signup') }
    if (!data.session) return { needsConfirmation: true }
  } catch (error) {
    return providerCooldown(error) ?? { error: credentialErrorMessage(error, 'signup', true) }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
