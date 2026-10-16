'use server'

import type { AuthActionResult } from '@/lib/auth/abuse-feedback'
import { authAbuseBlock } from '@/lib/auth/abuse'
import { providerCooldown } from '@/lib/auth/abuse-feedback'

import { createClient } from '@/lib/supabase/server'
import { recoveryEmailSchema } from '@/lib/auth/password-policy'

export async function requestPasswordReset(formData: FormData): Promise<AuthActionResult> {
  const parsed = recoveryEmailSchema.safeParse(formData.get('email'))
  if (!parsed.success) return { error: 'Enter a valid email address' }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!baseUrl) return { error: 'Password recovery is temporarily unavailable. Please try again later.' }
    const blocked = await authAbuseBlock('recovery', parsed.data, formData.get('captchaToken'))
    if (blocked) return blocked
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: new URL('/auth/callback?next=/reset-password', baseUrl).toString(),
    })
    // Email-specific throttling must not disclose whether this address exists.
    if (error?.code === 'over_email_send_rate_limit' || error?.code === 'email_not_found') return { success: true }
    const cooldown = providerCooldown(error)
    if (cooldown) return cooldown
    if (error) return { error: 'Unable to request a reset email right now. Please try again later.' }
    return { success: true }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code === 'over_email_send_rate_limit' || code === 'email_not_found') return { success: true }
    return providerCooldown(error) ?? { error: 'Unable to request a reset email right now. Please try again later.' }
  }
}
