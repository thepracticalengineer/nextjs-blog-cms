import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerAnalyticsPage, startAnalytics, trackNewsletterEvent } from '@/lib/analytics/client'
import { CONSENT_KEY, setConsent } from '@/lib/analytics/consent'

const config = { measurementId: 'G-TEST123', origin: window.location.origin }
const win = window as Window & { dataLayer?: IArguments[]; 'ga-disable-G-TEST123'?: boolean }
const page = { pathname: '/blog/article', title: 'Public article' }
let stop: (() => void) | undefined
let unregister: (() => void) | undefined
const commands = () => (win.dataLayer ?? []).map(args => Array.from(args))
const events = () => commands().filter(args => args[0] === 'event')
const load = () => document.querySelector<HTMLScriptElement>('#tpe-google-analytics')!.dispatchEvent(new Event('load'))
function begin() {
  unregister = registerAnalyticsPage(page)
  stop = startAnalytics(config)
}

beforeEach(() => {
  localStorage.clear()
  delete win.dataLayer
  history.replaceState(null, '', '/blog/article')
})
afterEach(() => { unregister?.(); stop?.(); document.querySelector('#tpe-google-analytics')?.remove() })

describe('consented analytics lifecycle', () => {
  it('does not load Google or queue any events before consent; rejects without loading', () => {
    begin()
    trackNewsletterEvent('newsletter_submit')
    expect(document.querySelector('#tpe-google-analytics')).toBeNull()
    expect(commands()).toEqual([])
    setConsent('denied')
    expect(document.querySelector('#tpe-google-analytics')).toBeNull()
  })
  it('initializes consent before configuration and emits exactly one pageview', () => {
    begin()
    setConsent('granted')
    expect(events()).toEqual([])
    expect(commands()[0]).toEqual(['consent', 'default', expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied' })])
    load()
    expect(events()).toHaveLength(1)
    expect(events()[0]).toEqual(['event', 'page_view', expect.objectContaining({ page_location: config.origin + page.pathname, page_title: page.title })])
    expect(commands().find(args => args[0] === 'config')?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false })
    unregister?.()
    unregister = registerAnalyticsPage({ ...page })
    expect(events()).toHaveLength(1)
    trackNewsletterEvent('newsletter_subscribe')
    expect(events()[1][1]).toBe('newsletter_subscribe')
  })
  it('redacts email-like title tokens and bounds long public titles', () => {
    unregister = registerAnalyticsPage({ ...page, title: 'Contact reader@example.com today' })
    stop = startAnalytics(config)
    setConsent('granted'); load()
    expect(events()[0][2]).toMatchObject({ page_title: 'Contact [redacted] today' })
    unregister()
    history.pushState(null, '', '/blog/long-title')
    unregister = registerAnalyticsPage({ pathname: '/blog/long-title', title: 'a'.repeat(100_000) })
    expect(events()[1][2]).toMatchObject({ page_title: 'a'.repeat(200) })
  })
  it('blocks immediately on private history navigation, even before React cleanup; resumes once on return', () => {
    setConsent('granted'); begin(); load()
    history.pushState(null, '', '/dashboard?token=secret')
    expect(win['ga-disable-G-TEST123']).toBe(true)
    trackNewsletterEvent('newsletter_subscribe')
    expect(events()).toHaveLength(1)
    unregister?.()
    history.pushState(null, '', page.pathname)
    unregister = registerAnalyticsPage({ ...page })
    expect(events()).toHaveLength(2)
    expect(JSON.stringify(commands())).not.toContain('secret')
    expect(JSON.stringify(commands())).not.toContain('/dashboard')
  })
  it('does not replay an old page or newsletter event when the tag loads after private navigation', () => {
    setConsent('granted'); begin()
    trackNewsletterEvent('newsletter_subscribe')
    history.replaceState(null, '', '/reset-password?code=secret')
    load()
    expect(events()).toEqual([])
    expect(win['ga-disable-G-TEST123']).toBe(true)
  })
  it('revokes immediately, clears cookies, and never queues outcomes after revocation', () => {
    setConsent('granted'); begin(); load()
    document.cookie = '_ga=test; Path=/'
    document.cookie = '_ga_TEST123=test; Path=/'
    setConsent('denied')
    trackNewsletterEvent('newsletter_subscribe')
    expect(win['ga-disable-G-TEST123']).toBe(true)
    expect(document.cookie).not.toContain('_ga')
    expect(events()).toHaveLength(1)
    setConsent('granted')
    expect(events().filter(args => args[1] === 'page_view')).toHaveLength(2)
    expect(document.querySelectorAll('#tpe-google-analytics')).toHaveLength(1)
  })
  it('honors cross-tab withdrawal and expired consent', () => {
    setConsent('granted'); begin(); load()
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ value: 'granted', expires: 1 }))
    window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }))
    trackNewsletterEvent('newsletter_submit')
    expect(win['ga-disable-G-TEST123']).toBe(true)
    expect(events()).toHaveLength(1)
  })
  it('does not start on a 404 or excluded origin without a public page registration', () => {
    setConsent('granted')
    stop = startAnalytics(config)
    expect(document.querySelector('#tpe-google-analytics')).toBeNull()
  })
  it('blocks popstate and removes outbound URL secrets', () => {
    setConsent('granted'); begin(); load()
    const a = document.createElement('a')
    a.href = 'https://github.com/org/repo?token=secret#private'
    a.textContent = 'Private text'
    a.addEventListener('click', e => e.preventDefault())
    document.body.append(a)
    a.click()
    a.remove()
    expect(events()[1]).toEqual(['event', 'click', expect.objectContaining({ link_url: 'https://github.com/', link_domain: 'github.com' })])
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(win['ga-disable-G-TEST123']).toBe(true)
    trackNewsletterEvent('newsletter_subscribe')
    expect(events()).toHaveLength(2)
    expect(JSON.stringify(commands())).not.toContain('secret')
    expect(JSON.stringify(commands())).not.toContain('Private text')
  })
})
