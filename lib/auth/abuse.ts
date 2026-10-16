import 'server-only'
import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { trustedClientIp } from './client-ip'
import type { AuthAbuseFeedback } from './abuse-feedback'

type AuthAction = 'login' | 'signup' | 'recovery' | 'confirmation' | 'password' | 'reauthentication'
const unavailable: AuthAbuseFeedback = { error: 'Authentication is temporarily unavailable. Please try again later.', retryAfter: 30 }
const challenge: AuthAbuseFeedback = { error: 'Complete the security check and try again.', captchaRequired: true }

function isPublicAction(action: AuthAction): boolean {
  return action !== 'password' && action !== 'reauthentication'
}

function botConfigured(action: AuthAction): boolean {
  return isPublicAction(action) && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)
}

async function budgetKeys(action: AuthAction, account: string) {
  const secret = process.env.AUTH_ABUSE_HMAC_KEY
  if (!secret || secret.length < 32) throw new Error('Missing abuse secret')
  const ip = trustedClientIp(await headers())
  const key = (kind: string, value: string) => createHmac('sha256', secret).update(`auth:v2:${kind}:${value}`).digest('hex')
  const normalized = account.trim().toLowerCase()
  const publicAction = isPublicAction(action)
  return {
    p_action: action,
    p_ip_key: key('ip', ip),
    // Without proof, another source must never be able to exhaust the victim's
    // account budget. Authenticated operations retain their authorized user key.
    p_account_key: publicAction && !botConfigured(action) ? key('account-ip', `${ip}:${normalized}`) : key('account', normalized),
  }
}

async function verifyProof(action: AuthAction, token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 2048) return false
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token }),
    signal: AbortSignal.timeout(4000), cache: 'no-store',
  })
  if (!response.ok) return false
  const result = await response.json()
  const hostnames = new Set([
    new URL(process.env.NEXT_PUBLIC_SITE_URL!).hostname,
    ...(process.env.AUTH_TURNSTILE_HOSTNAMES ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
  ])
  return result.success === true && hostnames.has(result.hostname) && result.action === action
}

type Decision = { allowed: boolean; challenge_required: boolean; retry_after: number }
function validDecision(value: unknown): value is Decision {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<Decision>
  if (typeof data.allowed !== 'boolean' || typeof data.challenge_required !== 'boolean') return false
  if (!Number.isInteger(data.retry_after) || data.retry_after! < 0 || data.retry_after! > 600) return false
  return data.allowed ? data.retry_after === 0 : data.retry_after! > 0
}

function ipReservation(value: unknown): value is Decision & { ip_attempts: number } {
  return validDecision(value) && 'ip_attempts' in value && Number.isInteger(value.ip_attempts) && (value.ip_attempts as number) > 0 && (value.ip_attempts as number) <= 100
}

async function reservePhase(args: object) {
  return createServiceClient().rpc('reserve_auth_attempt', args).abortSignal(AbortSignal.timeout(4000))
}

async function proofResult(action: AuthAction, token: unknown, bot: boolean) {
  if (!bot || !token) return { passed: false, failed: false, unavailable: false }
  try {
    const passed = await verifyProof(action, token)
    return { passed, failed: !passed, unavailable: false }
  } catch {
    return { passed: false, failed: true, unavailable: true }
  }
}

/** Privileged access is limited to opaque budgets, never account/profile reads. */
export async function authAbuseBlock(action: AuthAction, account: string, token?: unknown): Promise<AuthAbuseFeedback | null> {
  try {
    const publicAction = isPublicAction(action)
    if (publicAction && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) !== Boolean(process.env.TURNSTILE_SECRET_KEY)) return unavailable
    const keys = await budgetKeys(action, account)
    const ip = await reservePhase({ ...keys, p_phase: 'ip' })
    if (ip.error || !validDecision(ip.data)) return unavailable
    if (!ip.data.allowed) return { error: 'Too many attempts. Please wait before trying again.', retryAfter: ip.data.retry_after }
    if (!ipReservation(ip.data)) return unavailable
    const bot = botConfigured(action)
    // Invalid/missing proof consumes IP work without charging account state.
    const proof = await proofResult(action, token, bot)
    const { data, error } = await reservePhase({
      ...keys, p_phase: 'account', p_ip_attempts: ip.data.ip_attempts, p_bot_protection: bot, p_challenge_passed: proof.passed, p_challenge_failed: proof.failed,
    })
    if (error || !validDecision(data)) return unavailable
    if (!data.allowed) return { error: 'Too many attempts. Please wait before trying again.', retryAfter: data.retry_after }
    if (proof.unavailable) return unavailable
    if (data.challenge_required || proof.failed) return challenge
    return null
  } catch {
    return unavailable
  }
}

export async function recordAuthLoginFailure(account: string, error: unknown): Promise<void> {
  const { code, status } = error && typeof error === 'object' ? error as { code?: string; status?: number } : {}
  if (!['invalid_credentials', 'email_not_confirmed', 'user_not_found'].includes(code ?? '') && !(code == null && status === 400)) return
  try {
    const { p_account_key } = await budgetKeys('login', account)
    await createServiceClient().rpc('record_auth_login_failure', { p_account_key }).abortSignal(AbortSignal.timeout(4000))
  } catch {
    // A rejected credential never establishes a session. The independently
    // reserved IP budget remains enforced if recording the failure is unavailable.
  }
}
