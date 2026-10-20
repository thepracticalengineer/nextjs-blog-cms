import { describe, it, expect } from 'vitest'
import { can, canAccess, canAny } from '@/lib/permissions'
import type { Permission } from '@/lib/permissions'

describe('can', () => {
  it('returns false for null role', () => {
    expect(can(null, 'posts:create')).toBe(false)
  })

  it('returns false for undefined role', () => {
    expect(can(undefined, 'posts:create')).toBe(false)
  })

  it('admin can create posts', () => {
    expect(can('admin', 'posts:create')).toBe(true)
  })

  it('admin can read all posts', () => {
    expect(can('admin', 'posts:read:all')).toBe(true)
  })

  it('admin can update all posts', () => {
    expect(can('admin', 'posts:update:all')).toBe(true)
  })

  it('admin can delete all posts', () => {
    expect(can('admin', 'posts:delete:all')).toBe(true)
  })

  it('admin can manage users', () => {
    expect(can('admin', 'users:read')).toBe(true)
    expect(can('admin', 'users:update')).toBe(true)
  })

  it('admin can write categories', () => {
    expect(can('admin', 'categories:write')).toBe(true)
  })

  it('admin can write tags', () => {
    expect(can('admin', 'tags:write')).toBe(true)
  })

  it('author can create posts', () => {
    expect(can('author', 'posts:create')).toBe(true)
  })

  it('author can read own posts', () => {
    expect(can('author', 'posts:read:own')).toBe(true)
  })

  it('author cannot read all posts', () => {
    expect(can('author', 'posts:read:all')).toBe(false)
  })

  it('author cannot delete all posts', () => {
    expect(can('author', 'posts:delete:all')).toBe(false)
  })

  it('author cannot manage users', () => {
    expect(can('author', 'users:read')).toBe(false)
    expect(can('author', 'users:update')).toBe(false)
  })

  it('author cannot write categories', () => {
    expect(can('author', 'categories:write')).toBe(false)
  })

  it('author cannot write tags', () => {
    expect(can('author', 'tags:write')).toBe(false)
  })

  it('admin can write api keys', () => {
    expect(can('admin', 'ai_providers:write')).toBe(true)
  })

  it('author can write api keys', () => {
    expect(can('author', 'ai_providers:write')).toBe(true)
  })
})

describe('canAccess', () => {
  it('returns false for null role', () => {
    expect(canAccess(null, ['posts:create'])).toBe(false)
  })

  it('returns true when role has all permissions', () => {
    expect(canAccess('admin', ['posts:create', 'posts:read:all'])).toBe(true)
  })

  it('returns false when role is missing one permission', () => {
    expect(canAccess('author', ['posts:create', 'posts:read:all'])).toBe(false)
  })

  it('returns true for empty permissions array', () => {
    expect(canAccess('author', [])).toBe(true)
  })

  it('author can access own post permissions', () => {
    const authorPerms: Permission[] = ['posts:create', 'posts:read:own', 'posts:update:own']
    expect(canAccess('author', authorPerms)).toBe(true)
  })
})

describe('can — nullish coalescing fallback', () => {
  it('returns false for an unrecognized role value', () => {
    // Covers the `?? false` branch when rolePermissions[role] is undefined
    expect(can('superuser' as unknown as import('@/lib/permissions').Role, 'posts:create')).toBe(false)
  })
})

describe('canAny', () => {
  it('returns false for null role', () => {
    expect(canAny(null, ['posts:create'])).toBe(false)
  })

  it('returns true when role has at least one permission', () => {
    expect(canAny('author', ['posts:create', 'posts:read:all'])).toBe(true)
  })

  it('returns false when role has none of the permissions', () => {
    expect(canAny('author', ['users:read', 'users:update', 'tags:write'])).toBe(false)
  })

  it('returns false for empty permissions array', () => {
    expect(canAny('admin', [])).toBe(false)
  })

  it('admin has any of the elevated permissions', () => {
    expect(canAny('admin', ['posts:delete:all', 'categories:write'])).toBe(true)
  })
})
