export type AnalyticsConsent = 'unknown' | 'granted' | 'denied'
export const CONSENT_KEY = 'tpe.analytics-consent.v1'
const MAX_AGE = 180 * 24 * 60 * 60 * 1000
const listeners = new Set<() => void>()
type Choice = { value: 'granted' | 'denied'; expires: number }
let memory: Choice | undefined
let memoryOnly = false

function readChoice(): Choice | undefined {
  if (typeof window === 'undefined') return undefined
  if (memoryOnly) return memory
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY)
    const stored = raw ? JSON.parse(raw) : null
    return stored && ['granted', 'denied'].includes(stored.value) && Number.isFinite(stored.expires)
      ? stored : undefined
  } catch {
    return memory
  }
}

export function getConsent(): AnalyticsConsent {
  const choice = readChoice()
  return choice && choice.expires > Date.now() ? choice.value : 'unknown'
}

export function subscribeConsent(listener: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const scheduleExpiry = () => {
    clearTimeout(timer)
    const remaining = (readChoice()?.expires ?? 0) - Date.now()
    // Browser timers cap at ~24 days; re-arm for longer-lived choices.
    if (remaining > 0) timer = setTimeout(notify, Math.min(remaining, 2_147_483_647))
  }
  const notify = () => { listener(); scheduleExpiry() }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== CONSENT_KEY) return
    memoryOnly = false
    memory = undefined
    notify()
  }
  listeners.add(notify)
  window.addEventListener('storage', onStorage)
  scheduleExpiry()
  return () => {
    clearTimeout(timer)
    listeners.delete(notify)
    window.removeEventListener('storage', onStorage)
  }
}

export function setConsent(value: 'granted' | 'denied') {
  memory = { value, expires: Date.now() + MAX_AGE }
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(memory))
    memoryOnly = false
  } catch { memoryOnly = true }
  for (const listener of listeners) listener()
}

export function clearAnalyticsCookies() {
  const names = document.cookie.split(';').map(cookie => cookie.trim().split('=')[0])
    .filter(name => /^_ga(?:_|$)/.test(name))
  const parts = window.location.hostname.split('.')
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; Path=/`
    for (let i = 0; i < parts.length - 1; i++) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${parts.slice(i).join('.')}`
    }
  }
}
