import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { PublicAuthor } from '../types'
import type { AuthorLatestPost } from '../queries'
import { authorInitials, authorName, publicWebUrl } from '../presentation'

const externalLinks = [
  ['website', 'Website'], ['twitter_url', 'X / Twitter'], ['linkedin_url', 'LinkedIn'],
  ['github_url', 'GitHub'], ['instagram_url', 'Instagram'], ['facebook_url', 'Facebook'],
  ['youtube_url', 'YouTube'], ['tiktok_url', 'TikTok'],
] as const
const linkClass = 'rounded-sm hover:text-primary hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary'

export function AuthorSidebar({ author, posts }: { author: PublicAuthor; posts: AuthorLatestPost[] }) {
  const name = authorName(author.full_name)
  const avatar = publicWebUrl(author.avatar_url)
  const links = externalLinks.flatMap(([field, label]) => {
    const href = publicWebUrl(author[field])
    return href ? [{ label, href }] : []
  })

  return (
    <aside aria-label="About the author" className="flex min-w-0 flex-col gap-5">
      <Card>
        <CardHeader>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">About the author</p>
          <h2 className="min-w-0 text-xl font-semibold tracking-tight">
            <Link href={`/authors/${author.id}`} className={`flex items-center gap-3 ${linkClass}`}>
              <Avatar className="size-12" aria-hidden="true">
                {avatar && <AvatarImage src={avatar} alt="" />}
                <AvatarFallback>{authorInitials(author.full_name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
            </Link>
          </h2>
        </CardHeader>
        {(author.bio?.trim() || links.length > 0) && (
          <CardContent className="flex flex-col gap-4">
            {author.bio?.trim() && <p className="whitespace-pre-line leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{author.bio}</p>}
            {links.length > 0 && (
              <ul aria-label="Author links" className="flex flex-wrap gap-x-4 gap-y-1">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center font-medium ${linkClass}`}>
                      {label}<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        )}
      </Card>
      {posts.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold [overflow-wrap:anywhere]">More from {name}</h2>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4">
              {posts.map(post => (
                <li key={post.id}>
                  <Link href={`/blog/${post.slug}`} className={`block py-1 font-medium leading-relaxed [overflow-wrap:anywhere] ${linkClass}`}>{post.title}</Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </aside>
  )
}
