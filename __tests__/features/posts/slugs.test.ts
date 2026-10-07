import { describe, expect, it, vi } from 'vitest'
import { planSlug, writeWithSlug, isSlugConflict } from '@/features/posts/slugs'

describe('slug writes', () => {
  it('bounds generated slug length with room for collision suffixes', async () => {
    const plan = planSlug('', 'a'.repeat(500))
    const write = vi.fn().mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'posts_slug_key' } }).mockResolvedValue({ data: { id: 'post' }, error: null })
    const result = await writeWithSlug(plan, write)
    expect(result.slug.length).toBeLessThanOrEqual(200)
    expect(result.slug).toMatch(/-2$/)
  })
  it('does not retry permission, database or non-slug unique errors', async () => {
    for (const error of [{ code: '42501', message: 'Permission denied' }, { code: '23505', message: 'posts_pkey' }, { code: '08006', message: 'Connection failed' }]) {
      const write = vi.fn().mockResolvedValue({ data: null, error })
      expect((await writeWithSlug(planSlug('', 'Useful title'), write)).error).toEqual(error)
      expect(write).toHaveBeenCalledOnce()
      expect(isSlugConflict(error)).toBe(false)
    }
  })
  it('normalizes accents, spacing and case and rejects unusable manual slugs', () => {
    expect(planSlug(' Café Engineering ', '').slug).toBe('cafe-engineering')
    expect(planSlug('!!!', '').error).toBeDefined()
    expect(planSlug('', 'Edited title', false, 'stable-url').slug).toBe('stable-url')
  })
})

it('returns a field error for malformed runtime slug types', () => {
  for (const input of [null, 123, {}, []]) expect(planSlug(input, 'Title').error).toBe('Slug must be text.')
})
