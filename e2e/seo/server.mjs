import { createServer } from 'node:http'

const author = { id: '5af2b64d-c7c0-465f-901f-75cf70737172', full_name: 'Jane Doe', bio: 'Engineering guides.', avatar_url: null }
const category = { id: 'category', slug: 'engineering', name: 'Engineering', description: 'Practical engineering guides.' }
const tag = { id: 'tag', slug: 'systems', name: 'Systems', merged_into: null }
const post = { id: 'post', slug: 'resilient-job-queue', title: 'Designing a resilient job queue',
  excerpt: 'Retries and failure handling.', content: '<p>Use bounded retries for reliable queues.</p>',
  status: 'published', seo_title: null, seo_description: null, cover_image: null,
  published_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', reading_time_minutes: 5,
  author, category, tags: [{ tag }],
}
// Synthetic, read-only Data API; no Auth, database writes or external services.
createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.url !== '/rest/v1/rpc/get_popular_tags') {
    response.writeHead(405).end(); return
  }
  const url = new URL(request.url, 'http://127.0.0.1')
  const single = request.headers.accept?.includes('application/vnd.pgrst.object+json')
  const rows = url.pathname === '/rest/v1/posts' ? (Number(url.searchParams.get('offset')) > 0 ? [] : [post])
    : url.pathname === '/rest/v1/categories' ? [category]
    : url.pathname === '/rest/v1/tags' ? [tag]
    : url.pathname === '/rest/v1/public_author_profiles' ? [author]
    : []
  response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' })
  response.end(JSON.stringify(single ? rows[0] ?? null : rows))
}).listen(54996, '127.0.0.1')
