import { requirePermission } from '@/lib/auth/session'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getPostById } from '@/features/posts/queries'
import { PostEditor } from '@/components/dashboard/PostEditor'
import { PostStatusBadge } from '@/features/posts/components/PostStatusBadge'
import { getPostNewsletterState } from '@/features/newsletter/queries'

export const metadata: Metadata = { title: 'Edit Post' }

interface EditPostPageProps {
  params: Promise<{ id: string }>
}

export default async function EditPostPage({ params }: EditPostPageProps) {
  const profile = await requirePermission('posts:create')
  const { id } = await params
  const supabase = await createClient()
  const postLookup = getPostById(id).then(post => {
    if (!post || (profile.role !== 'admin' && post.author_id !== profile.id)) notFound()
    return post
  })
  // Newsletter access stays behind the ownership check, but need not wait for
  // unrelated taxonomy queries before starting.
  const [post, { data: categories }, { data: tags, error: tagsError }, newsletter] = await Promise.all([
    postLookup,
    supabase.from('categories').select('*').order('name'),
    supabase.from('tags').select('*').order('name'),
    postLookup.then(post => getPostNewsletterState(post.id)),
  ])

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">Edit Post</h1>
        <PostStatusBadge status={post.status} />
      </div>
      <PostEditor key={`${profile.id}:${post.id}`} draftIdentity={{ userId: profile.id, documentId: post.id }} post={post} newsletter={newsletter} categories={categories ?? []} tags={tags ?? []} tagsError={!!tagsError} canManageTags={profile.role === 'admin'} />
    </div>
  )
}
