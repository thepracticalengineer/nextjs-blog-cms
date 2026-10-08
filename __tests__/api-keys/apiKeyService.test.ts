import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateApiKey, hashApiKey } from '@/features/api-keys/apiKeyService'

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('generateApiKey', () => {
  it('returns a string prefixed with fmblog_', () => {
    const key = generateApiKey()
    expect(key).toMatch(/^fmblog_[0-9a-f]{64}$/)
  })

  it('returns a different key each call', () => {
    const key1 = generateApiKey()
    const key2 = generateApiKey()
    expect(key1).not.toBe(key2)
  })
})

describe('hashApiKey', () => {
  it('is deterministic — same input produces same output', () => {
    const key = 'fmblog_test123'
    expect(hashApiKey(key)).toBe(hashApiKey(key))
  })

  it('produces a 64-character hex string', () => {
    expect(hashApiKey('fmblog_test')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different keys produce different hashes', () => {
    expect(hashApiKey('fmblog_aaa')).not.toBe(hashApiKey('fmblog_bbb'))
  })
})

// ─── DB-backed helpers (mocked Supabase) ──────────────────────────────────────

/** Build a mock Supabase service client with a chainable query result. */
function makeServiceClient(result: { data?: unknown; error?: unknown }) {
  const q: any = {
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
    catch: (onRejected: (e: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    single: vi.fn().mockResolvedValue(result),
  }
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'ilike', 'order', 'limit']) {
    q[m] = vi.fn().mockReturnValue(q)
  }
  return { from: vi.fn().mockReturnValue(q) }
}

describe('validateApiKey', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns user_id for a valid active key', async () => {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const fakeKey = generateApiKey()

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'key-id', user_id: 'user-123', is_active: true },
      error: null,
    })
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockSingle,
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: mockUpdateEq,
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const { validateApiKey } = await import('@/features/api-keys/apiKeyService')
    const result = await validateApiKey(fakeKey)
    expect(result).toBe('user-123')
    expect(mockSingle).toHaveBeenCalledOnce()
    expect(mockUpdateEq).toHaveBeenCalledOnce()
  })

  it('returns null for a revoked key', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'key-id', user_id: 'user-123', is_active: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn() }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const { validateApiKey, generateApiKey: gen } = await import('@/features/api-keys/apiKeyService')
    const result = await validateApiKey(gen())
    expect(result).toBeNull()
  })

  it('returns null for a nonexistent key', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn() }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const { validateApiKey, generateApiKey: gen } = await import('@/features/api-keys/apiKeyService')
    const result = await validateApiKey(gen())
    expect(result).toBeNull()
  })

  it('logs a warning but still returns user_id when last_used_at update fails', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'key-id', user_id: 'user-xyz', is_active: true },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'update failed' } }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const { validateApiKey, generateApiKey: gen } = await import('@/features/api-keys/apiKeyService')
    const result = await validateApiKey(gen())
    expect(result).toBe('user-xyz')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

describe('createApiKey', () => {
  it('returns the new key and its raw value on success', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    const fakeKeyRow = { id: 'k1', name: 'My Key', key_preview: 'fmblog_...abcd', user_id: 'u1', created_at: '2024-01-01', last_used_at: null, is_active: true }

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: fakeKeyRow, error: null }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const { createApiKey } = await import('@/features/api-keys/apiKeyService')
    const result = await createApiKey('My Key', 'u1')
    expect(result.key).toEqual(fakeKeyRow)
    expect(result.rawKey).toMatch(/^fmblog_/)
  })

  it('throws when Supabase returns an error', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>)

    const { createApiKey } = await import('@/features/api-keys/apiKeyService')
    await expect(createApiKey('Bad Key', 'u1')).rejects.toThrow('insert failed')
  })
})

describe('listApiKeys', () => {
  it('returns an array of keys', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    const keys = [{ id: 'k1', name: 'A', key_preview: '...', user_id: 'u1', created_at: '2024-01-01', last_used_at: null, is_active: true }]

    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient({ data: keys, error: null }) as any)

    const { listApiKeys } = await import('@/features/api-keys/apiKeyService')
    const result = await listApiKeys('u1')
    expect(result).toEqual(keys)
  })

  it('throws on error', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient({ data: null, error: { message: 'fetch failed' } }) as any)

    const { listApiKeys } = await import('@/features/api-keys/apiKeyService')
    await expect(listApiKeys('u1')).rejects.toThrow('fetch failed')
  })
})

describe('revokeApiKey', () => {
  it('resolves without throwing on success', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient({ error: null }) as any)

    const { revokeApiKey } = await import('@/features/api-keys/apiKeyService')
    await expect(revokeApiKey('k1', 'u1')).resolves.toBeUndefined()
  })

  it('throws on error', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient({ error: { message: 'revoke failed' } }) as any)

    const { revokeApiKey } = await import('@/features/api-keys/apiKeyService')
    await expect(revokeApiKey('k1', 'u1')).rejects.toThrow('revoke failed')
  })
})

describe('deleteApiKey', () => {
  it('resolves without throwing on success', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient({ error: null }) as any)

    const { deleteApiKey } = await import('@/features/api-keys/apiKeyService')
    await expect(deleteApiKey('k1', 'u1')).resolves.toBeUndefined()
  })

  it('throws on error', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient({ error: { message: 'delete failed' } }) as any)

    const { deleteApiKey } = await import('@/features/api-keys/apiKeyService')
    await expect(deleteApiKey('k1', 'u1')).rejects.toThrow('delete failed')
  })
})

describe('resolveTagIds', () => {
  it('resolves merged aliases and deduplicates canonical relationships', async () => {
    const single = vi.fn()
      .mockResolvedValueOnce({ data: { id: 'alias', merged_into: 'canonical' } })
      .mockResolvedValueOnce({ data: { id: 'canonical', merged_into: null } })
    const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) })
    const { createServiceClient } = await import('@/lib/supabase/service')
    const supabase = { from: vi.fn().mockReturnValue({ select }) } as unknown as ReturnType<typeof createServiceClient>
    const { resolveTagIds } = await import('@/features/api-keys/apiKeyService')
    expect(await resolveTagIds(['SoftwareEngineering', 'Software engineering'], supabase)).toEqual(['canonical'])
    expect(select).toHaveBeenCalledWith('id, merged_into')
  })
  it('returns ids for existing tags', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    const client = makeServiceClient({ data: { id: 'tag-1' }, error: null })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const { resolveTagIds } = await import('@/features/api-keys/apiKeyService')
    const result = await resolveTagIds(['TypeScript'], client as any)
    expect(result).toContain('tag-1')
  })

  it('creates a new tag when it does not exist and returns its id', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    // First call: tag not found; second call: insert returns new id
    const notFound = { data: null, error: { message: 'not found' } }
    const created = { data: { id: 'new-tag-1' }, error: null }
    let callCount = 0
    const q: any = {
      then: (f: Function) => Promise.resolve(callCount++ === 0 ? notFound : created).then(f as any),
      single: vi.fn().mockImplementationOnce(() => Promise.resolve(notFound)).mockImplementationOnce(() => Promise.resolve(created)),
    }
    for (const m of ['select', 'insert', 'eq', 'ilike', 'order']) q[m] = vi.fn().mockReturnValue(q)
    const client = { from: vi.fn().mockReturnValue(q) }
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const { resolveTagIds } = await import('@/features/api-keys/apiKeyService')
    const result = await resolveTagIds(['New Tag'], client as any)
    expect(result).toEqual(['new-tag-1'])
  })

  it('returns empty array for empty input', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    const client = makeServiceClient({ data: null, error: null })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const { resolveTagIds } = await import('@/features/api-keys/apiKeyService')
    const result = await resolveTagIds([], client as any)
    expect(result).toEqual([])
  })
})

describe('resolveCategoryId', () => {
  it('returns id when found by slug', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    const client = makeServiceClient({ data: { id: 'cat-1' }, error: null })
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const { resolveCategoryId } = await import('@/features/api-keys/apiKeyService')
    const result = await resolveCategoryId('Technology', client as any)
    expect(result).toBe('cat-1')
  })

  it('returns null when category is not found by slug or name', async () => {
    vi.resetModules()
    const { createServiceClient } = await import('@/lib/supabase/service')
    const q: any = {
      then: (f: Function) => Promise.resolve({ data: null, error: null }).then(f as any),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    for (const m of ['select', 'insert', 'eq', 'ilike', 'order']) q[m] = vi.fn().mockReturnValue(q)
    const client = { from: vi.fn().mockReturnValue(q) }
    vi.mocked(createServiceClient).mockReturnValue(client as any)

    const { resolveCategoryId } = await import('@/features/api-keys/apiKeyService')
    const result = await resolveCategoryId('Unknown', client as any)
    expect(result).toBeNull()
  })
})
