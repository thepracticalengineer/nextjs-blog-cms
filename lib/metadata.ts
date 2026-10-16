import type { Metadata } from 'next'
import { parsePage } from '@/features/posts/list-state'

/** Use the configured origin, never a request Host header or preview deployment URL. */
export function siteUrl(): string {
  const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTP(S) origin without credentials')
  }
  return url.origin
}

type PageOptions = {
  page?: string | string[]
  totalPages?: number
  image?: string | null
  article?: { publishedTime?: string; modifiedTime?: string; authors?: string[] }
}

export function publicPageMetadata(path: string, title: string, description: string, options: PageOptions = {}): Metadata {
  const page = parsePage(options.page)
  const origin = siteUrl()
  // Next.js renders a root canonical as the bare origin. Match it in the sitemap.
  const outOfRange = page > 1 && options.totalPages !== undefined && page > options.totalPages
  const pagination = page > 1 && !outOfRange ? '?page=' + page : ''
  const canonical = `${origin}${path === '/' ? '' : path}${pagination}`
  const image = options.image || `${origin}/logo.png`
  const socialTitle = path === '/' ? 'The Practical Engineer' : `${title} | The Practical Engineer`
  return {
    title,
    description,
    alternates: { canonical },
    ...(outOfRange ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: socialTitle,
      description,
      url: canonical,
      siteName: 'The Practical Engineer',
      type: options.article ? 'article' : 'website',
      ...options.article,
      images: options.image ? [{ url: image }] : [{ url: image, width: 512, height: 512, alt: 'The Practical Engineer' }],
    },
    twitter: {
      card: options.image ? 'summary_large_image' : 'summary',
      title: socialTitle,
      description,
      images: [image],
    },
  }
}
