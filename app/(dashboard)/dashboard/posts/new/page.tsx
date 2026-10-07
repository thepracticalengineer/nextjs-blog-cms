import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { NewPostRecovery } from '@/features/posts/drafts/NewPostRecovery'
import { draftValuesSchema } from '@/features/posts/drafts/schema'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PostEditor } from '@/components/dashboard/PostEditor'

export const metadata: Metadata = { title: 'New Post' }

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const profile = await requirePermission('posts:create')
  const { draft } = await searchParams
  if (!draft || !z.uuid().safeParse(draft).success) redirect(`/dashboard/posts/new?draft=${randomUUID()}`)
  const supabase = await createClient()
  const [{ data: categories }, { data: tags }, { data: workingCopies }] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase.from('tags').select('*').order('name'),
    supabase.from('post_working_copies').select('document_id, values, updated_at').eq('user_id', profile.id).is('post_id', null).order('updated_at', { ascending: false }),
  ])

  return (
    <div className="p-4 md:p-8 pb-16 animate-page">
      <NewPostRecovery userId={profile.id} documentId={draft} serverCopies={(workingCopies ?? []).map(copy => ({ document_id: copy.document_id, title: draftValuesSchema.safeParse(copy.values).data?.title ?? '', updated_at: copy.updated_at }))} />
      <PostEditor key={`${profile.id}:${draft}`} draftIdentity={{ userId: profile.id, documentId: draft }} categories={categories ?? []} tags={tags ?? []} />
    </div>
  )
}
