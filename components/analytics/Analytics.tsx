'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getConsent, setConsent, subscribeConsent } from '@/lib/analytics/consent'
import { startAnalytics } from '@/lib/analytics/client'
import { publicLocation, type AnalyticsConfig } from '@/lib/analytics/policy'

type Props = Readonly<{ config: AnalyticsConfig }>
const serverLocation = () => null
const browserLocation = () => window.location.href
function subscribeLocation(notify: () => void) {
  window.addEventListener('popstate', notify)
  window.addEventListener('hashchange', notify)
  return () => {
    window.removeEventListener('popstate', notify)
    window.removeEventListener('hashchange', notify)
  }
}
function usePublicLocation(config: AnalyticsConfig) {
  // Next navigation commits also refresh the actual URL snapshot.
  usePathname()
  useSearchParams()
  const href = useSyncExternalStore(subscribeLocation, browserLocation, serverLocation)
  return href !== null && publicLocation(href, config) !== null
}

function ConsentPrompt() {
  const banner = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = banner.current
    if (!element) return
    const root = document.documentElement
    const update = () => root.style.setProperty('--analytics-prompt-height', `${element.getBoundingClientRect().height}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--analytics-prompt-height')
    }
  }, [])
  return (
    <section ref={banner} aria-label="Analytics preferences" className="fixed inset-x-0 bottom-0 z-50 max-h-[50dvh] overflow-y-auto border-t bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-muted-foreground">Allow Google Analytics cookies to help us understand article readership and newsletter signups? Optional analytics stays off unless you allow it.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setConsent('granted')}>Allow analytics</Button>
          <Button size="sm" variant="outline" onClick={() => setConsent('denied')}>No thanks</Button>
        </div>
      </div>
    </section>
  )
}

export function Analytics({ config }: Props) {
  const eligible = usePublicLocation(config)
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => 'unknown')
  const { measurementId, origin } = config
  useEffect(() => startAnalytics({ measurementId, origin }), [measurementId, origin])
  return eligible && consent === 'unknown' ? <ConsentPrompt /> : null
}

/** Footer control remains available after either decision, without a persistent banner. */
export function AnalyticsPreferences({ config }: Props) {
  const eligible = usePublicLocation(config)
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => 'unknown')
  if (!eligible || consent === 'unknown') return null
  const granted = consent === 'granted'
  return (
    <details className="mx-auto mt-4 max-w-xl px-4 text-sm text-foreground">
      <summary className="cursor-pointer">Analytics preferences</summary>
      <p className="my-3 text-muted-foreground">{granted ? 'Optional Google Analytics is on. You can turn it off at any time.' : 'Optional Google Analytics is off.'}</p>
      <Button size="sm" variant="outline" onClick={() => setConsent(granted ? 'denied' : 'granted')}>
        {granted ? 'Turn off analytics' : 'Allow analytics'}
      </Button>
    </details>
  )
}
