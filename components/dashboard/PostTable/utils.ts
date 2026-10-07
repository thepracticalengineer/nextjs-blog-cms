import type { PostWithRelations } from '@/features/posts/types'

export type SortField = 'title' | 'author' | 'status' | 'updated_at'
export type SortDir = 'asc' | 'desc'

export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

export function getCategories(posts: PostWithRelations[]) {
  const map = new Map<string, string>()
  for (const post of posts) {
    if (post.category) map.set(post.category.id, post.category.name)
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
}

export function filterAndSort(
  posts: PostWithRelations[],
  search: string,
  categoryFilter: string | null,
  sortField: SortField,
  sortDir: SortDir,
): PostWithRelations[] {
  let result = posts

  if (search.trim()) {
    const q = search.toLowerCase()
    result = result.filter(p => p.title.toLowerCase().includes(q))
  }

  if (categoryFilter) {
    result = result.filter(p => p.category?.id === categoryFilter)
  }

  return [...result].sort((a, b) => {
    let aVal = ''
    let bVal = ''
    if (sortField === 'title') {
      aVal = a.title.toLowerCase()
      bVal = b.title.toLowerCase()
    } else if (sortField === 'author') {
      aVal = (a.author?.full_name ?? '').toLowerCase()
      bVal = (b.author?.full_name ?? '').toLowerCase()
    } else if (sortField === 'status') {
      aVal = a.status
      bVal = b.status
    } else if (sortField === 'updated_at') {
      aVal = a.updated_at ?? ''
      bVal = b.updated_at ?? ''
    }
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })
}

export function buildPageNumbers(totalPages: number, currentPage: number): (number | '...')[] {
  return Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
      if (idx > 0 && typeof arr[idx - 1] === 'number' && p - (arr[idx - 1] as number) > 1) {
        acc.push('...')
      }
      acc.push(p)
      return acc
    }, [])
}
