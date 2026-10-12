import { revalidatePath } from 'next/cache'

export function refreshPostPaths(...slugs: (string | null | undefined)[]) {
  refreshDraftPaths()
  // Blog layout covers current/former article URLs and old/new taxonomy pages,
  // including historical redirects, without flushing unrelated site layouts.
  revalidatePath('/')
  revalidatePath('/blog', 'layout')
  revalidatePath('/authors/[id]', 'page')
  revalidatePath('/sitemap.xml')
  for (const slug of new Set(slugs.filter(Boolean))) revalidatePath(`/blog/${slug}`)
}

export function refreshDraftPaths() {
  revalidatePath('/dashboard/posts')
}
