export type SortField = 'title' | 'author' | 'status' | 'updated_at'
export type SortDir = 'asc' | 'desc'
export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]
export type ListSearchParams = Record<string, string | string[] | undefined>
export type DashboardListState = { page: number; pageSize: number; search: string; category: string | null; sort: SortField; direction: SortDir }

export function parsePage(value: string | string[] | undefined): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page <= 1_000_000 ? page : 1
}

export function parseDashboardListState(params: ListSearchParams): DashboardListState {
  return {
    page: parsePage(params.page),
    pageSize: typeof params.size === 'string' && PAGE_SIZE_OPTIONS.includes(Number(params.size)) ? Number(params.size) : 10,
    search: typeof params.q === 'string' ? params.q.trim().slice(0, 200) : '',
    category: typeof params.category === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.category) ? params.category : null,
    sort: ['title', 'author', 'status', 'updated_at'].includes(params.sort as string) ? params.sort as SortField : 'updated_at',
    direction: params.direction === 'asc' ? 'asc' : 'desc',
  }
}

export function dashboardListUrl(state: DashboardListState): string {
  const params = new URLSearchParams()
  if (state.page !== 1) params.set('page', String(state.page))
  if (state.pageSize !== 10) params.set('size', String(state.pageSize))
  if (state.search) params.set('q', state.search)
  if (state.category) params.set('category', state.category)
  if (state.sort !== 'updated_at') params.set('sort', state.sort)
  if (state.direction !== 'desc') params.set('direction', state.direction)
  return `/dashboard/posts${params.size ? `?${params}` : ''}`
}
