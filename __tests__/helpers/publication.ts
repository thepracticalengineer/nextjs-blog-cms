import { vi } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/service'

import { articleContent } from '@/e2e/publication-fixture'

export { articleContent }

export const validPost = {
  id: 'post-1', title: 'Integration Testing at Service Boundaries', slug: 'integration-testing-service-boundaries',
  content: articleContent, excerpt: 'Design integration tests that verify service contracts, idempotent retries, and recovery from partial failures.',
  seo_title: 'Integration Testing at Service Boundaries', seo_description: 'Practical contract tests for reliable engineering systems.',
  status: 'draft', author_id: 'user-1', cover_image: null, category_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', published_at: null as string | null,
  category: { name: 'Engineering' }, tags: [{ tag: { name: 'testing' } }],
}

type Row = Record<string, unknown>
// Stateful query double: assert actual attempted writes and preservation, rather
// than mocking readiness or merely checking that the validator was called.
export function postClient(initialPosts: Row[] = [], authorName: string | null = 'Frank Mendez', initialSends: Row[] = [], initialRoutes: Row[] = []) {
  const sends = initialSends.map(row => ({ ...row }))
  const posts = initialPosts.map(row => ({ ...row }))
  const writes: { table: string; operation: string; payload?: unknown }[] = []
  let race = false
  let slugRaces = 0
  const routes: Row[] = [...initialRoutes.map(row => ({ ...row })), ...posts.map(row => ({ slug: row.slug, post_id: row.id, was_published: row.status === 'published' }))]
  const reserveRoute = (row: Row, oldSlug?: unknown) => {
    const route = routes.find(route => route.slug === row.slug)
    if (route) route.was_published ||= row.status === 'published'
    else routes.push({ slug: row.slug, post_id: row.id, was_published: row.status === 'published' })
    if (oldSlug !== undefined && oldSlug !== row.slug) {
      const released = routes.findIndex(route => route.slug === oldSlug && route.post_id === row.id && !route.was_published)
      if (released >= 0) routes.splice(released, 1)
    }
  }
  const client = {
    from: vi.fn((table: string) => {
      let operation = 'select'
      let payload: Row | Row[] = {}
      const filters: ((row: Row) => boolean)[] = []
      const execute = () => {
        let rows = table === 'post_slug_routes' ? routes : table === 'newsletter_sends' ? sends : table === 'posts' ? posts : table === 'profiles' ? [{ id: 'user-1', full_name: authorName }] : []
        rows = rows.filter(row => filters.every(filter => filter(row)))
        if (operation !== 'select') {
          writes.push({ table, operation, payload })
          if (slugRaces > 0 && table === 'posts' && ['insert', 'update'].includes(operation)) {
            slugRaces--
            return { data: null, error: { code: '23505', message: 'duplicate key violates posts_slug_key' } }
          }
          if (race && table === 'posts') return { data: null, error: { message: 'Concurrent update' } }
          if (operation === 'upsert' && table === 'newsletter_sends') {
            const send = payload as Row
            if (!sends.some(row => row.post_id === send.post_id)) sends.push({ sending_started_at: null, sent_at: null, ...send })
          } else if (operation === 'insert') {
            const incoming = Array.isArray(payload) ? payload : [payload]
            if (table === 'posts' && incoming.some(row => posts.some(post => post.id === row.id))) {
              return { data: null, error: { code: '23505', message: 'Duplicate post ID' } }
            }
            if (table === 'posts' && incoming.some(row => routes.some(route => route.slug === row.slug && route.post_id !== row.id))) {
              return { data: null, error: { code: '23505', message: 'duplicate key violates post_slug_routes_pkey' } }
            }
            rows = incoming.map(row => ({ ...validPost, id: 'created-post', ...row }))
            if (table === 'posts') { posts.push(...rows); rows.forEach(row => reserveRoute(row)) }
          } else if (operation === 'update') {
            if (table === 'posts' && rows.some(row => routes.some(route => route.slug === (payload as Row).slug && route.post_id !== row.id))) {
              return { data: null, error: { code: '23505', message: 'duplicate key violates post_slug_routes_pkey' } }
            }
            for (const row of rows) {
              const oldSlug = row.slug
              Object.assign(row, payload)
              if (table === 'posts') reserveRoute(row, oldSlug)
            }
          } else if (operation === 'delete' && table === 'posts') {
            for (const row of rows) posts.splice(posts.indexOf(row), 1)
          }
        }
        return { data: rows.map(row => ({ ...row })), error: null }
      }
      const chain = {
        select: vi.fn(() => chain),
        upsert: vi.fn((value: Row) => { operation = 'upsert'; payload = value; return chain }),
        insert: vi.fn((value: Row | Row[]) => { operation = 'insert'; payload = value; return chain }),
        update: vi.fn((value: Row) => { operation = 'update'; payload = value; return chain }),
        delete: vi.fn(() => { operation = 'delete'; return chain }),
        eq: vi.fn((field: string, value: unknown) => { filters.push(row => row[field] === value); return chain }),
        is: vi.fn((field: string, value: unknown) => { filters.push(row => row[field] === value); return chain }),
        neq: vi.fn((field: string, value: unknown) => { filters.push(row => row[field] !== value); return chain }),
        in: vi.fn((field: string, values: unknown[]) => { filters.push(row => values.includes(row[field])); return chain }),
        maybeSingle: vi.fn(async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null } }),
        single: vi.fn(async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null } }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      }
      return chain
    }),
  } as unknown as ReturnType<typeof createServiceClient>
  return { client, posts, sends, routes, writes, simulateSlugRace: (count = 1) => { slugRaces = count }, simulateRace: () => { race = true } }
}
