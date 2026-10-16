import 'server-only'
import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { trustedClientIp } from './client-ip'
import type { AuthAbuseFeedback } from './abuse-feedback'

type AuthAction = 'login' | 'signup' | 'recovery' | 'confirmation' | 'password' | 'reauthentication'
const unavailable: AuthAbuseFeedback = { error: 'Authentication is temporarily unavailable. Please try again later.', retryAfter: 30 }
const challenge: AuthAbuseFeedback = { error: 'Complete the security check and try again.', captchaRequired: true }

/** Only reserves opaque abuse budgets. Never uses this privileged client to query accounts. */
export async function authAbuseBlock(action: AuthAction, account: string, token?: unknown): Promise<AuthAbuseFeedback | null> {
  try {
    const secret = process.env.AUTH_ABUSE_HMAC_KEY
    if (!secret || secret.length < 32) return unavailable
    const ip = trustedClientIp(await headers())
    const key = (kind: string, value: string) => createHmac('sha256', secret).update(`auth:v1:${kind}:${value}`).digest('hex')
    const { data, error } = await createServiceClient().rpc('reserve_auth_attempt', {
      p_action: action,
      p_ip_key: key('ip', ip),
      p_account_key: key('account', account.trim().toLowerCase()),
    }).abortSignal(AbortSignal.timeout(4000))
    if (error || !data || typeof data.allowed !== 'boolean' || typeof data.challenge_required !== 'boolean' ||
      !Number.isInteger(data.retry_after) || data.retry_after < 0 || data.retry_after > 600 ||
      (data.allowed && data.retry_after !== 0) || (!data.allowed && data.retry_after === 0)) return unavailable
    if (!data.allowed) return { error: 'Too many attempts. Please wait before trying again.', retryAfter: data.retry_after }

    const publicAction = action !== 'password' && action !== 'reauthentication'
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    const captchaSecret = process.env.TURNSTILE_SECRET_KEY
    // Partial configuration fails closed rather than silently disabling protection.
    if (publicAction && Boolean(siteKey) !== Boolean(captchaSecret)) return unavailable
    if (publicAction && siteKey && captchaSecret && data.challenge_required) {
      if (typeof token !== 'string' || !token || token.length > 2048) return challenge
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret: captchaSecret, response: token }),
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      })
      if (!response.ok) return challenge
      const result = await response.json()
      const hostname = new URL(process.env.NEXT_PUBLIC_SITE_URL!).hostname
      if (result.success !== true || result.hostname !== hostname || result.action !== action) return challenge
    }
    return null
  } catch {
    // No provider/store errors, passwords, tokens, IPs or raw email enter logs.
    return unavailable
  }
}
