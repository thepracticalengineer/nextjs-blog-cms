import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import type { Metadata } from 'next'
import { getPublishedPosts } from '@/features/posts/queries'
import { getPopularTags } from '@/features/posts/queries'
import { AuthorByline } from '@/features/authors/components/AuthorByline'
import { readTime, cn } from '@/lib/utils'
import type { PostWithRelations } from '@/features/posts/types'

export const metadata: Metadata = {
  title: 'Home',
  description: 'Practical deep-dives, guides, and architecture insights for engineers who ship.',
}

export const revalidate = 60

interface HomePageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams
  if (params.code) {
    redirect(`/auth/callback?code=${encodeURIComponent(params.code)}`)
  }

  const [{ posts }, popularTags] = await Promise.all([
    getPublishedPosts(1, 10),
    getPopularTags(8),
  ])

  const topArticles = posts.slice(0, 4)
  const sidebarTags = [...popularTags].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* 3-column grid — collapses to single column on small screens */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_220px] gap-0">

        {/* ── Left sidebar ── */}
        <aside className="hidden md:block pr-4">
          {/* Nav */}
          <nav className="flex flex-col gap-1 mb-6">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted font-semibold text-sm text-foreground">
              <span>🏠</span> Home
            </div>
            <Link
              href="/blog"
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <span>✏️</span> Articles
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <span>⚙️</span> Dashboard
            </Link>
          </nav>

          {/* Topics */}
          {sidebarTags.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Topics</p>
              <ul className="flex flex-col gap-2">
                {sidebarTags.map((tag) => (
                  <li key={tag.id}>
                    <Link
                      href={`/blog/tag/${tag.slug}`}
                      className="text-sm text-foreground hover:text-primary transition-colors"
                    >
                      #{tag.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* ── Main feed ── */}
        <main className="md:border-x md:border-border">
          {posts.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No articles yet — check back soon.
            </div>
          ) : (
            posts.map((post, i) => (
              <ArticleCard key={post.id} post={post} featured={i === 0} />
            ))
          )}
        </main>

        {/* ── Right sidebar ── */}
        <aside className="hidden md:flex flex-col gap-4 pl-4">

          {/* Popular Tags */}
          {popularTags.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <h2 className="font-bold text-sm text-foreground mb-3">Popular Tags</h2>
              <div className="flex flex-wrap gap-2">
                {popularTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/blog/tag/${tag.slug}`}
                    className="bg-muted text-muted-foreground text-xs rounded-full px-3 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    #{tag.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Top Articles */}
          {topArticles.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <h2 className="font-bold text-sm text-foreground mb-3">Top Articles</h2>
              <ol className="flex flex-col gap-3">
                {topArticles.map((post, i) => (
                  <li key={post.id} className="flex gap-3 items-start">
                    <span className="text-xl font-extrabold text-border leading-none min-w-[24px]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <Link
                        href={`/blog/${post.slug}`}
                        className="text-xs font-semibold text-foreground leading-snug hover:text-primary transition-colors line-clamp-2"
                      >
                        {post.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <AuthorByline author={post.author} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

        </aside>
      </div>
    </div>
  )
}

// ── Article card sub-component ────────────────────────────────────────────────

function ArticleCard({ post, featured }: { post: PostWithRelations; featured: boolean }) {
  const mins = readTime(post.content ?? '')
  const publishedDate = post.published_at
    ? format(new Date(post.published_at), 'MMM d')
    : null

  return (
    <article
      className={cn(
        'bg-card px-5 py-4 border-b border-border',
        featured && 'border-l-4 border-l-amber-400',
      )}
    >
      {/* Author row */}
      <div className="flex flex-wrap items-center gap-2.5 mb-2.5">

        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <AuthorByline author={post.author} showAvatar />
          {publishedDate && (
            <time
              dateTime={post.published_at!}
              className="text-muted-foreground text-xs"
            >
              {publishedDate}
            </time>
          )}
        </div>
      </div>

      {/* Title */}
      <Link href={`/blog/${post.slug}`}>
        <h2 className="text-lg font-bold text-foreground leading-snug hover:text-primary transition-colors mb-2">
          {post.title}
        </h2>
      </Link>

      {/* Tags */}
      {post.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {post.tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/blog/tag/${tag.slug}`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              #{tag.name}
            </Link>
          ))}
        </div>
      )}

      {/* Footer row */}
      <div className="flex justify-end">
        <span className="text-xs text-muted-foreground">{mins} min read</span>
      </div>
    </article>
  )
}
