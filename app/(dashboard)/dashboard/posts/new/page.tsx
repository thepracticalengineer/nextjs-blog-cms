import { randomUUID } from 'node:crypto'
import { redirect, notFound } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth/session'
import { NewPostRecovery } from '@/features/posts/drafts/NewPostRecovery'
import { draftValuesSchema } from '@/features/posts/drafts/schema'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PostEditor } from '@/components/dashboard/PostEditor'
import { getPostNewsletterState } from '@/features/newsletter/queries'
import { getPostById } from '@/features/posts/queries'

export const metadata: Metadata = { title: 'Write Post' }

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const profile = await requirePermission('posts:create')
  const { draft } = await searchParams
  if (!draft || !z.uuid().safeParse(draft).success) redirect(`/dashboard/posts/new?draft=${randomUUID()}`)
  const supabase = await createClient()
  // The document UUID is also the created post UUID. An old recovery link can
  // only reopen that post, even if cleanup or the create acknowledgement failed.
  // Render in place: server-action revalidation can revisit this page while
  // the author is still typing, so a redirect here would replace the editor.
  const { data: created } = await supabase.from('posts').select('id, author_id').eq('id', draft).maybeSingle()
  if (created && created.author_id !== profile.id) notFound()
  const [post, newsletter, { data: categories }, { data: tags, error: tagsError }, { data: workingCopies }] = await Promise.all([
    created ? getPostById(draft) : Promise.resolve(null),
    getPostNewsletterState(created?.id),
    supabase.from('categories').select('*').order('name'),
    supabase.from('tags').select('*').order('name'),
    supabase.from('post_working_copies').select('document_id, values, updated_at').eq('user_id', profile.id).is('post_id', null).order('updated_at', { ascending: false }),
  ])

  if (created && !post) notFound()

  return (
    <div className="p-4 md:p-8 pb-16 animate-page">
      <NewPostRecovery userId={profile.id} documentId={draft} serverCopies={(workingCopies ?? []).map(copy => ({ document_id: copy.document_id, title: draftValuesSchema.safeParse(copy.values).data?.title ?? '', updated_at: copy.updated_at }))} />
      <PostEditor authorName={profile.full_name} key={`${profile.id}:${draft}`} draftIdentity={{ userId: profile.id, documentId: draft }} post={post ?? undefined} newsletter={newsletter} categories={categories ?? []} tags={tags ?? []} tagsError={!!tagsError} canManageTags={profile.role === 'admin'} />
    </div>
  )
}
