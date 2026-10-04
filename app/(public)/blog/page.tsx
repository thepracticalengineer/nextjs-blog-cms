import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublishedPosts } from '@/features/posts/queries'
import { PostList } from '@/features/posts/components/PostList'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Articles',
  description: 'Practical knowledge for engineers who ship.',
}

interface BlogPageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const { page: pageParam } = await searchParams
  const page = Number(pageParam) || 1
  const limit = 12
  const { posts, total } = await getPublishedPosts(page, limit)

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 space-y-10">
      {/* Page header */}
      <div className="space-y-2 border-b pb-8">
        <p className="text-sm font-medium text-primary uppercase tracking-widest">The Practical Engineer</p>
        <h1 className="text-4xl font-bold tracking-tight">All Articles</h1>
        <p className="text-muted-foreground text-base max-w-xl">
          Practical knowledge for engineers who ship. Deep dives, guides, and architecture insights.
        </p>
      </div>

      <PostList posts={posts} />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          {page > 1 && (
            <Link
              href={`/blog?page=${page - 1}`}
              className="px-5 py-2 border rounded-full text-sm font-medium hover:bg-muted transition-colors shadow-xs"
            >
              ← Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/blog?page=${page + 1}`}
              className="px-5 py-2 border rounded-full text-sm font-medium hover:bg-muted transition-colors shadow-xs"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
