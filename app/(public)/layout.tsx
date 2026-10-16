import { Suspense } from 'react'
import { AnalyticsPreferences } from '@/components/analytics/Analytics'
import { analyticsConfig } from '@/lib/analytics/policy'
import Link from 'next/link'
import Image from 'next/image'
import { NavAuthButton } from '@/components/NavAuthButton'
import { HeaderSearch } from '@/components/HeaderSearch'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const analytics = analyticsConfig(process.env)

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-background focus:p-3">Skip to content</a>
      <header className="border-b border-border/60 sticky top-0 z-50 bg-background/95 backdrop-blur-xs">
        <div className="container max-w-5xl mx-auto py-4 px-4 flex flex-wrap gap-3 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Image src="/logo.png" alt="The Practical Engineer" width={32} height={32} className="rounded-xs" priority />
            <span
              className="font-bold text-lg tracking-tight"
              style={{ fontFamily: 'var(--font-playfair, serif)' }}
            >
              The Practical Engineer
            </span>
          </Link>
          <nav aria-label="Account and search" className="flex w-full min-w-0 items-center justify-end gap-3 sm:w-auto">
            <HeaderSearch />
            <NavAuthButton />
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 scroll-mt-40">{children}</main>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground/60 tracking-wide">
        <p>&copy; {new Date().getFullYear()} The Practical Engineer. All rights reserved.</p>
        {analytics && <Suspense fallback={null}><AnalyticsPreferences config={analytics} /></Suspense>}
      </footer>
    </div>
  )
}
