import { notFound, permanentRedirect } from 'next/navigation'
import { PageContent } from '@/features/pages/PageContent'
import { publishedPageMetadata, resolvePublicPage } from '@/features/pages/public'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }

async function resolve(params: Props['params']) {
  const { slug } = await params
  const page = await resolvePublicPage(slug)
  if (!page) notFound()
  if (slug !== page.slug) permanentRedirect(`/${page.slug}`)
  return page
}

export async function generateMetadata({ params }: Props) {
  return publishedPageMetadata(await resolve(params))
}

export default async function PublicPage({ params }: Props) {
  const page = await resolve(params)
  return <article className="mx-auto w-full max-w-7xl px-4 py-12">
    <h1 className="mb-8 break-words text-4xl font-bold">{page.title}</h1>
    <PageContent document={page.document} />
  </article>
}
