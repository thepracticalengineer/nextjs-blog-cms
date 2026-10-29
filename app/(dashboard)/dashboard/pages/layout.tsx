import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth/session'
export const metadata: Metadata = { title: 'Pages', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export default async function PagesLayout({ children }: { children: React.ReactNode }) {
  await requirePermission('pages:read')
  return <div className="min-w-0 p-4 md:p-8">{children}</div>
}
