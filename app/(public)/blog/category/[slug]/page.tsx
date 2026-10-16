import { cache } from 'react'
import { AnalyticsPage } from '@/components/analytics/AnalyticsPage'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { publicPageMetadata } from '@/lib/metadata'
import { createClient } from '@/lib/supabase/server'
import { PostList } from '@/features/posts/components/PostList'
import { getPublishedPosts } from '@/features/posts/queries'
import { parsePage, type ListSearchParams } from '@/features/posts/list-state'
import { PostPagination } from '@/features/posts/components/PostPagination'

// These pages read request cookies; URLs created after the build must render dynamically.
export const dynamic = 'force-dynamic'

const pageSize = 12
const getArchivePosts = cache((id: string, page: number) => getPublishedPosts(page, pageSize, { categoryId: id }))

interface CategoryPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<ListSearchParams>
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!category) return {}
  const { page } = await searchParams
  const { total } = await getArchivePosts(category.id, parsePage(page))
  return publicPageMetadata(`/blog/category/${encodeURIComponent(category.slug)}`, `${category.name} - Blog`,
    category.description?.trim() || `Browse published articles about ${category.name} on The Practical Engineer.`, { page, totalPages: Math.ceil(total / pageSize) })
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: category } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!category) notFound()

  const page = parsePage((await searchParams).page)
  const { posts, total } = await getArchivePosts(category.id, page)

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 space-y-10">
      <AnalyticsPage pathname={`/blog/category/${category.slug}`} title={`${category.name} - Blog | The Practical Engineer`} />
      <div className="space-y-2 border-b pb-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          Back to Blog
        </Link>
        <p className="text-sm font-medium text-primary uppercase tracking-widest">Category</p>
        <h1 className="text-4xl font-bold tracking-tight">{category.name}</h1>
        {category.description && (
          <p className="text-muted-foreground text-base max-w-xl">{category.description}</p>
        )}
      </div>
      <PostList posts={posts} />
      <PostPagination path={`/blog/category/${slug}`} page={page} total={total} pageSize={pageSize} />
    </div>
  )
}
