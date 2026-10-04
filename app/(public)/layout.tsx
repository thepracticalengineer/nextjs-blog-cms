import Link from 'next/link'
import Image from 'next/image'
import { NavAuthButton } from '@/components/NavAuthButton'
import { HeaderSearch } from '@/components/HeaderSearch'

export default function PublicLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 sticky top-0 z-50 bg-background/95 backdrop-blur-xs">
        <div className="container max-w-5xl mx-auto py-4 px-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <Image src="/logo.png" alt="The Practical Engineer" width={32} height={32} className="rounded-xs" priority />
            <span
              className="font-bold text-lg tracking-tight"
              style={{ fontFamily: 'var(--font-playfair, serif)' }}
            >
              The Practical Engineer
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <HeaderSearch />
            <NavAuthButton />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground/60 tracking-wide">
        <p>&copy; {new Date().getFullYear()} The Practical Engineer. All rights reserved.</p>
      </footer>
    </div>
  )
}
