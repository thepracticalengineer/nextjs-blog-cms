import { AnalyticsPage } from '@/components/analytics/AnalyticsPage'
import { publicPageMetadata } from '@/lib/metadata'
import { parsePage } from '@/features/posts/list-state'
import { PostPagination } from '@/features/posts/components/PostPagination'
import { getPublishedPosts } from '@/features/posts/queries'
import { PostList } from '@/features/posts/components/PostList'

export const revalidate = 60

interface BlogPageProps {
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ searchParams }: BlogPageProps) {
  return publicPageMetadata('/blog', 'Articles', 'Practical knowledge for engineers who ship.', { page: (await searchParams).page })
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const { page: pageParam } = await searchParams
  const page = parsePage(pageParam)
  const limit = 12
  const { posts, total } = await getPublishedPosts(page, limit)


  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 space-y-10">
      <AnalyticsPage pathname="/blog" title="Articles | The Practical Engineer" />
      {/* Page header */}
      <div className="space-y-2 border-b pb-8">
        <p className="text-sm font-medium text-primary uppercase tracking-widest">The Practical Engineer</p>
        <h1 className="text-4xl font-bold tracking-tight">All Articles</h1>
        <p className="text-muted-foreground text-base max-w-xl">
          Practical knowledge for engineers who ship. Deep dives, guides, and architecture insights.
        </p>
      </div>

      <PostList posts={posts} />

      <PostPagination path="/blog" page={page} total={total} pageSize={limit} />
    </div>
  )
}
