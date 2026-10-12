import { describe, expect, it } from 'vitest'
import { dashboardListUrl, parseDashboardListState, parsePage } from '@/features/posts/list-state'

describe('post list URL state', () => {
  it.each([undefined, '', '0', '-1', '1.5', 'Infinity', '1000001', ['2']])('rejects invalid page %j', value => {
    expect(parsePage(value)).toBe(1)
  })
  it('round trips every dashboard control', () => {
    const state = parseDashboardListState({ page: '103', size: '25', q: '  100%_*(title)  ', category: '00000000-0000-4000-8000-000000000077', sort: 'author', direction: 'asc' })
    const url = new URL(dashboardListUrl(state), 'https://example.com')
    expect(parseDashboardListState(Object.fromEntries(url.searchParams))).toEqual(state)
    expect(state.search).toBe('100%_*(title)')
  })
  it('bounds unknown, repeated, and excessively long parameters', () => {
    expect(parseDashboardListState({ page: ['2'], size: '100000', q: 'x'.repeat(1000), category: 'invalid', sort: 'content', direction: 'invalid' })).toEqual({
      page: 1, pageSize: 10, search: 'x'.repeat(200), category: null, sort: 'updated_at', direction: 'desc',
    })
  })
  it('omits default query parameters', () => {
    expect(dashboardListUrl(parseDashboardListState({}))).toBe('/dashboard/posts')
  })
})
