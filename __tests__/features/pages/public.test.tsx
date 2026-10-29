// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const state = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/static', () => ({ createStaticClient: () => ({ rpc: state.rpc }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404') }, permanentRedirect: (path: string) => { throw new Error(`308 ${path}`) } }))
import PublicPage, { generateMetadata } from '@/app/(public)/[slug]/page'
import { resolvePublicPage } from '@/features/pages/public'
const snapshot = { title: 'Published title', slug: 'about', seo_title: 'Public SEO', seo_description: 'Public description', document: { version: 1, blocks: [{ type: 'paragraph', text: 'Public body' }] }, page_id: '28600000-0000-4000-8000-000000000001', revision: '28600000-0000-4000-8000-000000000002', published_at: '2026-10-29T00:00:00Z' }
const props = (slug: string) => ({ params: Promise.resolve({ slug }) })
beforeEach(() => {
  state.rpc.mockReset().mockResolvedValue({ data: snapshot, error: null })
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test')
})
describe('public snapshot route', () => {
  it('renders only the snapshot and builds canonical/social metadata from it', async () => {
    const html = renderToStaticMarkup(await PublicPage(props('about')))
    expect(html).toContain('Published title')
    expect(html).toContain('Public body')
    const metadata = await generateMetadata(props('about'))
    expect(metadata).toMatchObject({ title: 'Public SEO', description: 'Public description', alternates: { canonical: 'https://example.test/about' }, openGraph: { url: 'https://example.test/about', type: 'website', description: 'Public description' }, twitter: { description: 'Public description' } })
    expect(state.rpc).toHaveBeenCalledWith('resolve_page_path', { p_slug: 'about' })
  })
  it.each(['old-about', 'oldest-about', 'ABOUT'])('redirects %s directly to the current snapshot', async slug => {
    await expect(PublicPage(props(slug))).rejects.toThrow('308 /about')
    await expect(generateMetadata(props(slug))).rejects.toThrow('308 /about')
  })
  it.each(['missing', 'draft-only', 'unpublished'])('returns 404 without metadata for %s', async slug => {
    state.rpc.mockResolvedValue({ data: null, error: null })
    await expect(PublicPage(props(slug))).rejects.toThrow('404')
    await expect(generateMetadata(props(slug))).rejects.toThrow('404')
  })
  it('fails closed for unsupported snapshots and disallowed images', async () => {
    state.rpc.mockResolvedValue({ data: { ...snapshot, document: { version: 99 } }, error: null })
    expect(await resolvePublicPage('about')).toBeNull()
    state.rpc.mockResolvedValue({ data: { ...snapshot, document: { version: 2, content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://blocked.invalid/private.png' } }] } } }, error: null })
    expect(await resolvePublicPage('about')).toBeNull()
  })
  it('never queries reserved or malformed paths', async () => {
    for (const slug of ['BLOG', 'api', 'about%2Fus', 'about/us']) expect(await resolvePublicPage(slug)).toBeNull()
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('does not turn an outage into a cacheable missing page', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'private SQL detail' } })
    await expect(resolvePublicPage('about')).rejects.toThrow('Public pages unavailable')
  })
  it('falls back to the published title and suppresses inherited descriptions', async () => {
    state.rpc.mockResolvedValue({ data: { ...snapshot, seo_title: '', seo_description: '' }, error: null })
    const metadata = await generateMetadata(props('about'))
    expect(metadata.title).toBe('Published title')
    expect(metadata.description).toBeNull()
    expect(metadata.openGraph?.description).toBeUndefined()
    expect(metadata.twitter?.description).toBeUndefined()
  })
})
