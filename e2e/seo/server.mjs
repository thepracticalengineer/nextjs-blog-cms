import { createServer } from 'node:http'

const author = { id: '5af2b64d-c7c0-465f-901f-75cf70737172', full_name: 'Jane Doe', bio: 'Engineering guides.', avatar_url: null, website: 'https://example.com', github_url: 'javascript:alert(1)' }
const category = { id: 'category', slug: 'engineering', name: 'Engineering', description: 'Practical engineering guides.' }
const tag = { id: 'tag', slug: 'systems', name: 'Systems', merged_into: null }
const post = { id: 'post', slug: 'resilient-job-queue', title: 'Designing a resilient job queue',
  excerpt: 'Retries and failure handling.', content: '<p>Use bounded retries for reliable queues.</p>',
  status: 'published', seo_title: null, seo_description: null, cover_image: null,
  published_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', reading_time_minutes: 5,
  author_id: author.id, author, category, tags: [{ tag }],
}
const posts = Array.from({ length: 13 }, (_, index) => index === 0 ? post : {
  ...post, published_at: index === 1 ? '2026-10-03T00:00:00Z' : post.published_at, id: `post-${index}`, slug: `queue-guide-${index}`, title: `Queue guide ${index}`,
})

const sparseAuthor = { ...author, id: '6af2b64d-c7c0-465f-901f-75cf70737172', full_name: ' ', bio: null, website: null }
const pairAuthor = { ...author, id: '7af2b64d-c7c0-465f-901f-75cf70737172', full_name: 'Pair Author' }
const longAuthor = { ...author, id: '8af2b64d-c7c0-465f-901f-75cf70737172', full_name: 'A'.repeat(120), bio: 'B'.repeat(400), avatar_url: 'http://127.0.0.1:3110/logo.png' }
const extraPosts = [
  { ...post, id: 'long-current', slug: 'long-current', title: 'Long profile article', author_id: longAuthor.id, author: longAuthor },
  { ...post, id: 'long-other', slug: 'long-other', title: 'C'.repeat(150), author_id: longAuthor.id, author: longAuthor },
  { ...post, id: 'solo', slug: 'solo', title: 'Solo article', author_id: sparseAuthor.id, author: sparseAuthor },
  { ...post, id: 'pair-current', slug: 'pair-current', title: 'Pair current', author_id: pairAuthor.id, author: pairAuthor },
  { ...post, id: 'pair-other', slug: 'pair-other', title: 'Pair other', author_id: pairAuthor.id, author: pairAuthor },
  { ...post, id: 'private', slug: 'private', title: 'Private draft', status: 'draft' },
  { ...post, id: 'private-working-copy', slug: 'private-working-copy', title: 'Private working copy', status: 'draft' },
]

function matchingPosts(params) {
  const slugFilter = params.get('slug')
  const authorFilter = params.get('author_id')
  const statusFilter = params.get('status')
  const exclude = params.get('id')
  let matches = slugFilter || authorFilter ? [...posts, ...extraPosts] : posts
  if (slugFilter) matches = matches.filter(row => `eq.${row.slug}` === slugFilter)
  if (authorFilter) matches = matches.filter(row => `eq.${row.author_id}` === authorFilter)
  if (statusFilter) matches = matches.filter(row => `eq.${row.status}` === statusFilter)
  if (exclude?.startsWith('neq.')) matches = matches.filter(row => row.id !== exclude.slice(4))
  if (params.get('order') === 'published_at.desc.nullslast,id.desc') {
    matches = [...matches].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? '') || b.id.localeCompare(a.id))
  }
  return matches
}

// Synthetic, read-only Data API; no Auth, database writes or external services.
createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.url !== '/rest/v1/rpc/get_popular_tags') {
    response.writeHead(405).end(); return
  }
  const url = new URL(request.url, 'http://127.0.0.1')
  const single = request.headers.accept?.includes('application/vnd.pgrst.object+json')
  let rows = []
  let total = 1
  let offset = 0
  switch (url.pathname) {
    case '/rest/v1/posts': {
      const matches = matchingPosts(url.searchParams)
      total = matches.length
      offset = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || total)
      if (request.headers.prefer?.includes('count=exact') && offset > 0 && offset >= total) {
        response.writeHead(416, { 'Content-Type': 'application/json', 'Content-Range': `*/${total}` })
        response.end(JSON.stringify({ code: 'PGRST103', message: 'Requested range not satisfiable' }))
        return
      }
      rows = matches.slice(offset, offset + limit)
      break
    }
    case '/rest/v1/categories': rows = [category]; break
    case '/rest/v1/tags': rows = [tag]; break
    case '/rest/v1/public_author_profiles': rows = [author, sparseAuthor, pairAuthor, longAuthor].filter(row => !url.searchParams.get('id') || `eq.${row.id}` === url.searchParams.get('id')); break
    default: total = 0
  }
  const contentRange = rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`
  response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': contentRange })
  response.end(JSON.stringify(single ? rows[0] ?? null : rows))
}).listen(15494, '127.0.0.1')
