'use server'

import type { AuthActionResult } from '@/lib/auth/abuse-feedback'
import { authAbuseBlock, recordAuthLoginFailure } from '@/lib/auth/abuse'
import { providerCooldown } from '@/lib/auth/abuse-feedback'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { credentialFields, loginSchema } from '@/lib/auth/credentials'
import { credentialErrorMessage } from '@/lib/auth/credential-errors'

export async function login(formData: FormData): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(credentialFields(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    const blocked = await authAbuseBlock('login', parsed.data.email, formData.get('captchaToken'))
    if (blocked) return blocked
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) {
      await recordAuthLoginFailure(parsed.data.email, error)
      return providerCooldown(error) ?? { error: credentialErrorMessage(error, 'login') }
    }
  } catch (error) {
    await recordAuthLoginFailure(parsed.data.email, error)
    return providerCooldown(error) ?? { error: credentialErrorMessage(error, 'login', true) }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
