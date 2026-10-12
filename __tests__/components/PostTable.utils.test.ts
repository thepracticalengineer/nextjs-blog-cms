import { describe, it, expect } from 'vitest'
import { buildPageNumbers } from '@/components/dashboard/PostTable/utils'

describe('buildPageNumbers', () => {
  it('returns all pages when totalPages <= 5', () => {
    expect(buildPageNumbers(3, 2)).toEqual([1, 2, 3])
    expect(buildPageNumbers(1, 1)).toEqual([1])
  })

  it('inserts ellipsis when pages are skipped', () => {
    const pages = buildPageNumbers(10, 5)
    expect(pages).toContain('...')
  })

  it('always includes first and last page', () => {
    const pages = buildPageNumbers(10, 5)
    expect(pages[0]).toBe(1)
    expect(pages[pages.length - 1]).toBe(10)
  })

  it('includes current page and neighbors', () => {
    const pages = buildPageNumbers(10, 5)
    expect(pages).toContain(4)
    expect(pages).toContain(5)
    expect(pages).toContain(6)
  })

  it('no ellipsis for adjacent pages near start', () => {
    const pages = buildPageNumbers(4, 2)
    expect(pages).not.toContain('...')
  })
})
