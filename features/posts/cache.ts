import { revalidatePath } from 'next/cache'

export function refreshPostPaths(...slugs: (string | null | undefined)[]) {
  revalidatePath('/dashboard/posts')
  // Invalidate public listings, author/taxonomy pages and article pages together.
  revalidatePath('/', 'layout')
  revalidatePath('/sitemap.xml')
  for (const slug of new Set(slugs.filter(Boolean))) revalidatePath(`/blog/${slug}`)
}
