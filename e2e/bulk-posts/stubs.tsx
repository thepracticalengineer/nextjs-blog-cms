import React from 'react'
import type { BulkPostItem, BulkPostResponse } from '@/features/posts/bulk-actions'
import type { DashboardPostSummary } from '@/features/posts/types'
export let rows = Array.from({ length: 6 }, (_, i) => ({
  id: `22300000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  title: `Post ${i + 1}`, slug: `post-${i + 1}`, excerpt: '',
  status: i % 2 === 0 ? 'published' : 'draft', updated_at: '2026-10-20T00:00:00Z', author: null, category: null, tags: [],
})) as DashboardPostSummary[]
export function useRouter() {
  return {
    push(url: string) { history.pushState(null, '', url); dispatchEvent(new Event('fixture-refresh')) },
    refresh() { dispatchEvent(new Event('fixture-refresh')) },
  }
}
export default function Link(props: React.ComponentProps<'a'>) { return <a {...props} /> }
export async function unpublishPost() { return {} }
export async function deletePost() { return {} }
export async function bulkPostAction(action: 'delete' | 'unpublish', items: BulkPostItem[]): Promise<BulkPostResponse> {
  const response = await fetch('/__bulk', { method: 'POST', body: JSON.stringify({ action, items }) })
  const result: BulkPostResponse = await response.json()
  for (const item of result.results ?? []) {
    if (item.status !== 'success') continue
    if (action === 'delete') rows = rows.filter(row => row.id !== item.id)
    else rows = rows.map(row => row.id === item.id ? { ...row, status: 'draft' } : row)
  }
  return result
}
