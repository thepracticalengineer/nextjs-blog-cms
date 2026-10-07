import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getPublicAuthor, getAuthorPublishedPosts, parseAuthorPage } from '@/features/authors/queries'
import { authorInitials, authorName, publicWebUrl } from '@/features/authors/presentation'
import { PostList } from '@/features/posts/components/PostList'

export const revalidate = 60

interface AuthorPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string | string[] }>
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { id } = await params
  const author = await getPublicAuthor(id)
  if (!author) notFound()
  const name = authorName(author.full_name)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return {
    title: `${name} — Author`,
    description: author.bio?.trim().slice(0, 160) || `Read published articles by ${name} on The Practical Engineer.`,
    alternates: { canonical: `${siteUrl}/authors/${author.id}` },
  }
}

const externalLinks = [
  ['website', 'Website'], ['twitter_url', 'X / Twitter'], ['linkedin_url', 'LinkedIn'],
  ['github_url', 'GitHub'], ['instagram_url', 'Instagram'], ['facebook_url', 'Facebook'],
  ['youtube_url', 'YouTube'], ['tiktok_url', 'TikTok'],
] as const

const paginationClass = 'inline-flex min-h-11 items-center px-5 py-2 border rounded-full text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary'

export default async function AuthorPage({ params, searchParams }: AuthorPageProps) {
  const { id } = await params
  const author = await getPublicAuthor(id)
  if (!author) notFound()
  const { page: pageParam } = await searchParams
  const page = parseAuthorPage(pageParam)
  const limit = 12
  const { posts, total } = await getAuthorPublishedPosts(author.id, page, limit)
  const totalPages = Math.ceil(total / limit)
  const name = authorName(author.full_name)
  const avatar = publicWebUrl(author.avatar_url)

  return (
    <div className="container max-w-5xl mx-auto py-12 px-4 space-y-10">
      <header className="border-b pb-8 space-y-6">
        <Link href="/blog" className="text-sm text-muted-foreground hover:text-primary rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">← All articles</Link>
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          <Avatar className="size-20 shrink-0" aria-hidden="true">
            {avatar && <AvatarImage src={avatar} alt="" />}
            <AvatarFallback className="text-2xl">{authorInitials(author.full_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-3">
            <p className="text-sm font-medium text-primary uppercase tracking-widest">Author</p>
            <h1 className="text-4xl font-bold tracking-tight break-words">{name}</h1>
            {author.bio?.trim() && <p className="text-muted-foreground max-w-2xl whitespace-pre-line break-words">{author.bio}</p>}
            <ul aria-label="Author links" className="flex flex-wrap gap-x-4 gap-y-2">
              {externalLinks.map(([field, label]) => {
                const href = publicWebUrl(author[field])
                return href ? <li key={field}><a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium hover:text-primary hover:underline underline-offset-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{label}<span className="sr-only"> (opens in a new tab)</span></a></li> : null
              })}
            </ul>
          </div>
        </div>
      </header>

      <section aria-labelledby="author-articles" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="author-articles" className="text-2xl font-semibold tracking-tight">Published articles</h2>
          <p className="text-sm text-muted-foreground">{total} {total === 1 ? 'article' : 'articles'}</p>
        </div>
        {posts.length ? <PostList posts={posts} showTags /> : (
          <div className="text-center py-16 space-y-3">
            <p className="text-lg font-medium">{total === 0 ? 'No published articles yet.' : 'No articles on this page.'}</p>
            {page > 1 ? <Link className={paginationClass} href={`/authors/${author.id}`}>Back to first page</Link> : <p className="text-sm text-muted-foreground">Check back soon for new writing from {name}.</p>}
          </div>
        )}
        {totalPages > 1 && page <= totalPages && (
          <nav aria-label="Author article pagination" className="flex flex-wrap items-center justify-center gap-3 pt-4">
            {page > 1 && <Link href={`/authors/${author.id}?page=${page - 1}`} className={paginationClass}>← Previous</Link>}
            <span className="text-sm text-muted-foreground" aria-current="page">Page {page} of {totalPages}</span>
            {page < totalPages && <Link href={`/authors/${author.id}?page=${page + 1}`} className={paginationClass}>Next →</Link>}
          </nav>
        )}
      </section>
    </div>
  )
}
