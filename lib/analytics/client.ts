import { clearAnalyticsCookies, getConsent, subscribeConsent } from './consent'
import { publicLocation, publicReferrer, type AnalyticsConfig, type AnalyticsPage } from './policy'

type EventParameters = Record<string, string | number | boolean>
type AnalyticsWindow = Window & {
  dataLayer?: IArguments[]
  gtag?: (...args: unknown[]) => void
} & Record<`ga-disable-${string}`, boolean>

const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }
let runtime: ReturnType<typeof createAnalytics> | undefined
let page: AnalyticsPage | undefined

/** Only successfully rendered, public pages register; layouts/404s never activate collection. */
export function registerAnalyticsPage(next: AnalyticsPage) {
  page = next
  runtime?.activate()
  return () => {
    if (page === next) {
      page = undefined
      runtime?.pause()
    }
  }
}

export function startAnalytics(config: AnalyticsConfig) {
  runtime?.dispose()
  const instance = createAnalytics(config)
  runtime = instance
  instance.activate()
  return () => {
    instance.dispose()
    if (runtime === instance) runtime = undefined
  }
}

export function trackNewsletterEvent(name: 'newsletter_submit' | 'newsletter_subscribe') {
  runtime?.event(name, { placement: 'article_footer' })
}

function createAnalytics(config: AnalyticsConfig) {
  const win = window as unknown as AnalyticsWindow
  const disableKey = `ga-disable-${config.measurementId}` as const
  let ready = false
  let configured = false
  let disposed = false
  let script: HTMLScriptElement | undefined
  let activeHref = ''
  let lastView = ''
  let previousLocation = publicReferrer(document.referrer, config)
  let context: EventParameters = {}
  let scrollSent = false

  function pause() {
    win[disableKey] = true
    activeHref = ''
  }
  pause()

  function eligible() {
    return !disposed && getConsent() === 'granted' && page &&
      page.pathname === window.location.pathname && publicLocation(window.location.href, config)
  }

  function command(...args: unknown[]) { win.gtag?.(...args) }

  function activate() {
    const location = eligible()
    if (!location) { pause(); return }
    if (!script) {
      // No events/configuration are queued while the vendor script is pending.
      // Its onload checks the CURRENT page and consent, never the original page.
      win.dataLayer = win.dataLayer ?? []
      win.gtag = function () { win.dataLayer!.push(arguments) }
      command('consent', 'default', denied)
      command('js', new Date())
      script = document.createElement('script')
      script.id = 'tpe-google-analytics'
      script.async = true
      script.referrerPolicy = 'no-referrer'
      script.src = `https://www.googletagmanager.com/gtag/js?id=${config.measurementId}`
      script.onload = () => { ready = true; activate() }
      script.onerror = pause
      document.head.append(script)
    }
    if (!ready) return
    context = {
      page_location: location,
      page_referrer: previousLocation,
      page_title: page!.title.replace(/\S+@\S+/g, '[redacted]').slice(0, 200),
    }
    command('consent', 'update', { ...denied, analytics_storage: 'granted' })
    command('config', config.measurementId, {
      ...context, send_page_view: false, allow_google_signals: false,
      allow_ad_personalization_signals: false, ...(configured ? { update: true } : {}),
    })
    configured = true
    win[disableKey] = false
    activeHref = window.location.href
    if (lastView !== activeHref) {
      event('page_view')
      lastView = activeHref
      previousLocation = location
      scrollSent = false
    }
  }

  function event(name: string, params: EventParameters = {}) {
    if (!ready || win[disableKey] || !eligible() || activeHref !== window.location.href) return
    command('event', name, { ...params, ...context, send_to: config.measurementId })
  }

  // Disable synchronously BEFORE a history mutation, not after React effects run.
  // Install before loading Google; keep its automatic history/form/etc. measurement OFF.
  const originals = { pushState: history.pushState, replaceState: history.replaceState }
  function wrap(method: typeof history.pushState) {
    return function (this: History, ...args: Parameters<typeof history.pushState>) {
      if (args[2] != null && new URL(String(args[2]), window.location.href).href !== window.location.href) {
        pause()
        lastView = ''
      }
      return method.apply(this, args)
    }
  }
  const push = wrap(originals.pushState)
  const replace = wrap(originals.replaceState)
  history.pushState = push
  history.replaceState = replace
  const onPop = () => { pause(); lastView = '' }
  window.addEventListener('popstate', onPop, true)
  window.addEventListener('hashchange', onPop, true)
  const onPageHide = () => pause()
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) lastView = ''
    activate()
  }
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)

  const unsubscribe = subscribeConsent(() => {
    if (getConsent() !== 'granted') {
      pause()
      if (script) command('consent', 'update', denied)
      clearAnalyticsCookies()
      lastView = ''
      return
    }
    activate()
  })
  const onClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return
    const link = e.target.closest('a[href]') as HTMLAnchorElement | null
    if (!link) return
    try {
      const target = new URL(link.href)
      if (!['http:', 'https:'].includes(target.protocol) || target.origin === config.origin) return
      // Never expose outbound query strings, fragments, paths, or link text.
      event('click', { outbound: true, link_domain: target.hostname, link_url: `${target.origin}/` })
    } catch { /* malformed link */ }
  }
  const onScroll = () => {
    const height = document.documentElement.scrollHeight
    if (!scrollSent && height > window.innerHeight && window.scrollY + window.innerHeight >= height * 0.9 &&
      ready && !win[disableKey] && eligible() && activeHref === window.location.href) {
      scrollSent = true
      event('scroll', { percent_scrolled: 90 })
    }
  }
  document.addEventListener('click', onClick, true)
  window.addEventListener('scroll', onScroll, { passive: true })

  return {
    pause, activate, event,
    dispose() {
      disposed = true
      pause()
      unsubscribe()
      if (history.pushState === push) history.pushState = originals.pushState
      if (history.replaceState === replace) history.replaceState = originals.replaceState
      window.removeEventListener('popstate', onPop, true)
      window.removeEventListener('hashchange', onPop, true)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('scroll', onScroll)
      if (script) { script.onload = null; script.remove() }
    },
  }
}
