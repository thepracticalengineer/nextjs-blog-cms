'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getConsent, setConsent, subscribeConsent } from '@/lib/analytics/consent'
import { startAnalytics } from '@/lib/analytics/client'
import { publicLocation, type AnalyticsConfig } from '@/lib/analytics/policy'

export function Analytics({ config }: { config: AnalyticsConfig }) {
  const pathname = usePathname()
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => 'unknown')
  const { measurementId, origin } = config
  useEffect(() => startAnalytics({ measurementId, origin }), [measurementId, origin])

  // Preference controls are available on public pages; private forms never get a banner.
  if (!publicLocation(new URL(pathname, config.origin).href, config)) return null
  return (
    <section aria-label="Analytics preferences" className="border-t bg-background px-4 py-4 text-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-muted-foreground">
          {consent === 'unknown'
            ? 'Allow Google Analytics cookies to help us understand article readership and newsletter signups? Optional analytics stays off unless you allow it.'
            : consent === 'granted'
              ? 'Optional Google Analytics is on. You can turn it off at any time.'
              : 'Optional Google Analytics is off.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {consent !== 'granted' && <Button size="sm" variant="outline" onClick={() => setConsent('granted')}>Allow analytics</Button>}
          {consent !== 'denied' && <Button size="sm" variant="outline" onClick={() => setConsent('denied')}>
            {consent === 'granted' ? 'Turn off analytics' : 'No thanks'}
          </Button>}
        </div>
      </div>
    </section>
  )
}
