import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { getPage } from '@/features/pages/actions'
import { PageManager } from '@/features/pages/management/PageManager'
export default async function EditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ recovery?: string }> }) {
  const profile = await requirePermission('pages:update')
  const { id } = await params
  const { recovery } = await searchParams
  const result = await getPage(id)
  if (result.error) return <p role="alert">{result.error.message}</p>
  if (!result.data) notFound()
  const documentId = recovery && z.uuid().safeParse(recovery).success ? recovery : id
  return <PageManager key={`${profile.id}:${id}`} accountId={profile.id} documentId={documentId} initialPage={result.data} />
}
