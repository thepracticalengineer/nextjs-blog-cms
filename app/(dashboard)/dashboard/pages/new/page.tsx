import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { PageManager } from '@/features/pages/management/PageManager'
export default async function NewPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const profile = await requirePermission('pages:create')
  const { draft } = await searchParams
  if (!draft || !z.uuid().safeParse(draft).success) redirect(`/dashboard/pages/new?draft=${randomUUID()}`)
  return <PageManager key={`${profile.id}:${draft}`} accountId={profile.id} documentId={draft} initialPage={null} />
}
