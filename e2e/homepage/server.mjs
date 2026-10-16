import { createServer } from 'node:http'

// Read-only synthetic public content. No database, Auth, mail or webhooks.
createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  const data = path === '/rest/v1/posts' ? [{
    id: 'homepage-fixture', title: 'Designing a resilient job queue', slug: 'resilient-job-queue',
    excerpt: 'Retries and failure handling.', published_at: '2026-10-01T00:00:00Z',
    reading_time_minutes: 5, author: null, category: null, tags: [],
  }] : []
  response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' })
  response.end(JSON.stringify(data))
}).listen(54995, '127.0.0.1')
