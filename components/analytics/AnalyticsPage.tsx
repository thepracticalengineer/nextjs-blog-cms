'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { registerAnalyticsPage } from '@/lib/analytics/client'
import type { AnalyticsPage as Page } from '@/lib/analytics/policy'

function PageRegistration({ pathname, title }: Page) {
  const currentPath = usePathname()
  const query = useSearchParams().toString()
  useEffect(() => {
    if (currentPath !== pathname) return
    return registerAnalyticsPage({ pathname, title })
  }, [pathname, title, currentPath, query])
  return null
}

/** Render only after a public page has successfully resolved (never in its layout). */
export function AnalyticsPage(props: Page) {
  return <Suspense fallback={null}><PageRegistration {...props} /></Suspense>
}
