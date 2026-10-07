import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getProfile: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Mock the stateless @supabase/supabase-js client used in updatePassword
const mockAnonSignIn = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithPassword: mockAnonSignIn },
  })),
}))

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { updateProfile, updateAvatar, deleteAvatar, updatePassword } from '@/features/profile/actions'

const mockCreateClient = vi.mocked(createClient)
const mockGetProfile = vi.mocked(getProfile)

const fakeProfile = {
  id: 'user-1',
  email: 'test@example.com',
  full_name: 'Test User',
  avatar_url: null,
  role: 'author',
  confirmed_at: null,
  created_at: null,
  updated_at: null,
  bio: null,
  pronouns: null,
  company: null,
  location: null,
  website: null,
  twitter_url: null,
  linkedin_url: null,
  github_url: null,
  instagram_url: null,
  facebook_url: null,
  youtube_url: null,
  tiktok_url: null,
}

function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: any = {}
  for (const m of ['select', 'update', 'eq', 'single']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = (fn: (v: unknown) => unknown) => Promise.resolve(result).then(fn)
  return chain
}

function makeSupabase({
  dbResult = { data: null, error: null } as { data: unknown; error: { message: string } | null },
  uploadError = null as { message: string } | null,
  removeError = null as { message: string } | null,
  publicUrl = 'https://example.com/avatars/user-1/avatar.jpg',
  authSignInError = null as { message: string } | null,
  authUpdateError = null as { message: string } | null,
} = {}) {
  return {
    from: vi.fn().mockReturnValue(makeChain(dbResult)),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: uploadError }),
        remove: vi.fn().mockResolvedValue({ error: removeError }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl } }),
        list: vi.fn().mockResolvedValue({ data: [{ name: 'avatar.jpg' }], error: null }),
      }),
    },
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: authSignInError }),
      updateUser: vi.fn().mockResolvedValue({ error: authUpdateError }),
    },
  }
}

beforeEach(() => { vi.clearAllMocks() })

// ─── updateProfile ────────────────────────────────────────────────────────────

describe('updateProfile', () => {
  it('returns validation errors keyed by the failed fields', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    const result = await updateProfile({ full_name: ' ', github_url: 'ftp://example.com' })
    expect(result.fieldErrors?.full_name).toEqual(['Name is required'])
    expect(result.fieldErrors?.github_url).toEqual(['Use a valid HTTP or HTTPS URL without credentials'])
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('returns error when not authenticated', async () => {
    mockGetProfile.mockResolvedValue(null)
    const result = await updateProfile({ full_name: 'Frank' })
    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('returns error when db update fails', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockCreateClient.mockResolvedValue(
      makeSupabase({ dbResult: { data: null, error: { message: 'DB error' } } }) as any
    )
    const result = await updateProfile({ full_name: 'Frank' })
    expect(result).toEqual({ error: 'DB error' })
  })

  it('returns success on valid update', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockCreateClient.mockResolvedValue(makeSupabase() as any)
    const result = await updateProfile({ full_name: 'Frank', bio: 'Hello' })
    expect(result).toEqual({ success: true })
  })

  it('binds normalized changes to the authenticated owner and refreshes public pages', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    const supabase = makeSupabase()
    mockCreateClient.mockResolvedValue(supabase as any)
    expect(await updateProfile({ full_name: '  Frank  ', bio: ' ', website: 'https://example.com' })).toEqual({ success: true })
    const chain = supabase.from.mock.results[0].value
    expect(chain.update).toHaveBeenCalledWith({ full_name: 'Frank', bio: null, website: 'https://example.com' })
    expect(chain.eq).toHaveBeenCalledWith('id', fakeProfile.id)
    expect(revalidatePath).toHaveBeenCalledWith(`/authors/${fakeProfile.id}`)
    expect(revalidatePath).toHaveBeenCalledWith('/blog', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it.each(['id', 'role', 'email', 'author_id', 'avatar_url'])('rejects forbidden %s changes before creating a database client', async (key) => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    const result = await updateProfile({ full_name: 'Frank', [key]: key === 'id' ? 'another-user' : 'changed' } as any)
    expect(result.error).toBeDefined()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it.each(['javascript:alert(1)', 'data:text/html,test', 'ftp://example.com', '//example.com', 'https://user:password@example.com', 'invalid'])('rejects unsafe external URL %s', async (url) => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    expect((await updateProfile({ website: url })).error).toBeDefined()
    expect((await updateProfile({ github_url: url })).error).toBeDefined()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it.each([null, [], 'text', {}, { bio: 123 }, { full_name: ' ' }, { bio: 'a'.repeat(2001) }, { website: 'https://example.com/' + 'a'.repeat(2048) }])('rejects malformed runtime payload %#', async (data) => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    expect((await updateProfile(data as any)).error).toBeDefined()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('allows optional fields to be cleared and valid HTTP links', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockCreateClient.mockResolvedValue(makeSupabase() as any)
    expect(await updateProfile({ bio: null, website: '', github_url: 'http://example.com' })).toEqual({ success: true })
  })
})

// ─── updateAvatar ─────────────────────────────────────────────────────────────

describe('updateAvatar', () => {
  it('returns error when not authenticated', async () => {
    mockGetProfile.mockResolvedValue(null)
    const fd = new FormData()
    fd.set('avatar', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const result = await updateAvatar(fd)
    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('returns error when file exceeds 2 MB', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    const bigFile = new File([new ArrayBuffer(3 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    const fd = new FormData()
    fd.set('avatar', bigFile)
    const result = await updateAvatar(fd)
    expect(result).toEqual({ error: 'File too large (max 2 MB)' })
  })

  it('returns error when upload fails', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockCreateClient.mockResolvedValue(
      makeSupabase({ uploadError: { message: 'Upload failed' } }) as any
    )
    const fd = new FormData()
    fd.set('avatar', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const result = await updateAvatar(fd)
    expect(result).toEqual({ error: 'Upload failed' })
  })

  it('returns success and versioned public URL on valid upload', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockCreateClient.mockResolvedValue(makeSupabase() as any)
    const fd = new FormData()
    fd.set('avatar', new File(['data'], 'photo.jpg', { type: 'image/jpeg' }))
    const result = await updateAvatar(fd)
    expect(result.error).toBeUndefined()
    expect((result as { avatar_url: string }).avatar_url).toMatch(
      /^https:\/\/example\.com\/avatars\/user-1\/avatar\.jpg\?v=\d+$/
    )
  })

  it('returns error for invalid file type', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    const fd = new FormData()
    fd.set('avatar', new File(['data'], 'photo.exe', { type: 'application/octet-stream' }))
    const result = await updateAvatar(fd)
    expect(result).toEqual({ error: 'Invalid file type. Use JPG, PNG, or GIF.' })
  })
})

// ─── deleteAvatar ─────────────────────────────────────────────────────────────

describe('deleteAvatar', () => {
  it('returns error when not authenticated', async () => {
    mockGetProfile.mockResolvedValue(null)
    const result = await deleteAvatar()
    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('returns success immediately when no avatar set', async () => {
    mockGetProfile.mockResolvedValue({ ...fakeProfile, avatar_url: null } as any)
    const result = await deleteAvatar()
    expect(result).toEqual({ success: true })
  })

  it('returns error when storage remove fails', async () => {
    mockGetProfile.mockResolvedValue({
      ...fakeProfile,
      avatar_url: 'https://abc.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg',
    } as any)
    const supabaseMock = makeSupabase({ removeError: { message: 'Remove failed' } })
    mockCreateClient.mockResolvedValue(supabaseMock as any)
    const result = await deleteAvatar()
    expect(result).toEqual({ error: 'Remove failed' })
  })

  it('removes file from storage and clears avatar_url', async () => {
    mockGetProfile.mockResolvedValue({
      ...fakeProfile,
      avatar_url: 'https://abc.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg',
    } as any)
    const supabaseMock = makeSupabase()
    mockCreateClient.mockResolvedValue(supabaseMock as any)
    const result = await deleteAvatar()
    const bucketMock = supabaseMock.storage.from.mock.results[0].value
    // list is called with the user's folder, then remove is called with the derived paths
    expect(bucketMock.list).toHaveBeenCalledWith('user-1')
    expect(bucketMock.remove).toHaveBeenCalledWith(['user-1/avatar.jpg'])
    expect(result).toEqual({ success: true })
  })
})

// ─── updatePassword ───────────────────────────────────────────────────────────

describe('updatePassword', () => {
  it('returns error when not authenticated', async () => {
    mockGetProfile.mockResolvedValue(null)
    const result = await updatePassword('old', 'new')
    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('returns "Current password is incorrect" when error code is invalid_credentials', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockAnonSignIn.mockResolvedValue({ error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } })
    const result = await updatePassword('wrong', 'newpass')
    expect(result).toEqual({ error: 'Current password is incorrect' })
  })

  it('returns "Current password is incorrect" when status is 400 and no code', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockAnonSignIn.mockResolvedValue({ error: { code: null, status: 400, message: 'Invalid login credentials' } })
    const result = await updatePassword('wrong', 'newpass')
    expect(result).toEqual({ error: 'Current password is incorrect' })
  })

  it('surfaces non-credential errors as-is', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockAnonSignIn.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429, message: 'Email rate limit exceeded' } })
    const result = await updatePassword('any', 'newpass')
    expect(result).toEqual({ error: 'Email rate limit exceeded' })
  })

  it('returns error when updateUser fails', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockAnonSignIn.mockResolvedValue({ error: null })
    mockCreateClient.mockResolvedValue(
      makeSupabase({ authUpdateError: { message: 'Update failed' } }) as any
    )
    const result = await updatePassword('correct', 'newpass')
    expect(result).toEqual({ error: 'Update failed' })
  })

  it('returns success on valid password change', async () => {
    mockGetProfile.mockResolvedValue(fakeProfile as any)
    mockAnonSignIn.mockResolvedValue({ error: null })
    mockCreateClient.mockResolvedValue(makeSupabase() as any)
    const result = await updatePassword('correct', 'newpass123')
    expect(result).toEqual({ success: true })
  })
})
