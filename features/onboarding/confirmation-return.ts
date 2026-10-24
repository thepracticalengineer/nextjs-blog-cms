import { createHmac, timingSafeEqual } from 'node:crypto'
import { onboardingReturnPath } from './validation'

function secret() {
  const key = process.env.AUTH_ABUSE_HMAC_KEY
  if (!key || key.length < 32) throw new Error('Signup is temporarily unavailable.')
  return key
}
function digest(value: string) {
  return createHmac('sha256', secret()).update(`signup-return:v1:${value}`).digest('base64url')
}
export function signSignupReturn(value: unknown, email: string, now = Date.now() / 1000): string | null {
  const next = onboardingReturnPath(value)
  if (next === '/dashboard') return null
  const payload = Buffer.from(JSON.stringify({ next, owner: digest(email.trim().toLowerCase()), expires: Math.floor(now) + 86400 })).toString('base64url')
  return `${payload}.${digest(payload)}`
}
export function readSignupReturn(token: string | null, email: string | undefined, now = Date.now() / 1000): string {
  try {
    if (!token || token.length > 4096 || !email) return '/dashboard'
    const [payload, signature, extra] = token.split('.')
    if (!payload || !signature || extra) return '/dashboard'
    const expected = Buffer.from(digest(payload))
    const actual = Buffer.from(signature)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return '/dashboard'
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!Number.isFinite(data.expires) || data.expires < now || data.owner !== digest(email.trim().toLowerCase())) return '/dashboard'
    return onboardingReturnPath(data.next)
  } catch { return '/dashboard' }
}
