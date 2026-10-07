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
export function postClient(initialPosts: Row[] = [], authorName: string | null = 'Frank Mendez') {
  const posts = initialPosts.map(row => ({ ...row }))
  const writes: { table: string; operation: string; payload?: unknown }[] = []
  let race = false
  const client = {
    from: vi.fn((table: string) => {
      let operation = 'select'
      let payload: Row | Row[] = {}
      const filters: ((row: Row) => boolean)[] = []
      const execute = () => {
        let rows = table === 'posts' ? posts : table === 'profiles' ? [{ id: 'user-1', full_name: authorName }] : []
        rows = rows.filter(row => filters.every(filter => filter(row)))
        if (operation !== 'select') {
          writes.push({ table, operation, payload })
          if (race && table === 'posts') return { data: null, error: { message: 'Concurrent update' } }
          if (operation === 'insert') {
            rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({ ...validPost, ...row, id: 'created-post' }))
            if (table === 'posts') posts.push(...rows)
          } else if (operation === 'update') {
            for (const row of rows) Object.assign(row, payload)
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
        neq: vi.fn((field: string, value: unknown) => { filters.push(row => row[field] !== value); return chain }),
        in: vi.fn((field: string, values: unknown[]) => { filters.push(row => values.includes(row[field])); return chain }),
        maybeSingle: vi.fn(async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null } }),
        single: vi.fn(async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null } }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      }
      return chain
    }),
  } as unknown as ReturnType<typeof createServiceClient>
  return { client, posts, writes, simulateRace: () => { race = true } }
}
