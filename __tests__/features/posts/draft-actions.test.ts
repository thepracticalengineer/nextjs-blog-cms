import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/auth/session', () => ({ getProfile: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { getProfile } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { loadWorkingCopy, saveWorkingCopy, discardWorkingCopy, type SaveWorkingCopyInput } from '@/features/posts/drafts/actions'
import { draftValues } from '@/features/posts/drafts/schema'

const userId = '00000000-0000-4000-8000-000000000001'
const postId = '00000000-0000-4000-8000-000000000002'
const documentId = '00000000-0000-4000-8000-000000000003'
const revision1 = '00000000-0000-4000-8000-000000000004'
const revision2 = '00000000-0000-4000-8000-000000000005'
type Row = Record<string, unknown>
let rows: Row[]
let writes: { table: string; operation: string }[]
let posts: Row[]
let loseAcknowledgement: boolean
const input = (overrides: Partial<SaveWorkingCopyInput> = {}): SaveWorkingCopyInput => ({ editorId: userId, documentId, postId: null, values: { ...draftValues(), content: 'Private writing' }, revision: revision1, expectedRevision: null, baseUpdatedAt: null, ...overrides })

beforeEach(() => {
  vi.clearAllMocks(); rows = []; writes = []; posts = [{ id: postId, author_id: userId, status: 'published', content: 'Public content' }]; loseAcknowledgement = false
  vi.mocked(getProfile).mockResolvedValue({ id: userId, role: 'author' } as Awaited<ReturnType<typeof getProfile>>)
  const client = { from: (table: string) => {
    let operation = 'select'; let payload: Row = {}; const filters: ((row: Row) => boolean)[] = []
    const execute = () => {
      let result = (table === 'posts' ? posts : rows).filter(row => filters.every(filter => filter(row)))
      if (operation !== 'select') writes.push({ table, operation })
      if (operation === 'insert') {
        if (rows.some(row => row.user_id === payload.user_id && row.document_id === payload.document_id)) return { data: null, error: { code: '23505' } }
        rows.push({ ...payload }); result = [rows.at(-1)!]
      } else if (operation === 'update') result.forEach(row => Object.assign(row, payload))
      else if (operation === 'delete') rows = rows.filter(row => !result.includes(row))
      if (loseAcknowledgement && operation !== 'select') { loseAcknowledgement = false; return { data: null, error: { code: 'NETWORK' } } }
      return { data: result[0] ?? null, error: operation === 'update' && !result.length ? { code: 'PGRST116' } : null }
    }
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain },
      insert: (row: Row) => { operation = 'insert'; payload = row; return chain },
      update: (row: Row) => { operation = 'update'; payload = row; return chain },
      delete: () => { operation = 'delete'; return chain },
      single: async () => execute(), maybeSingle: async () => execute(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
    }
    return chain
  } }
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
})

describe('private working copy actions', () => {
  it('recreates a discarded copy without overwriting an existing competing revision', async () => {
    await saveWorkingCopy(input())
    await discardWorkingCopy(documentId, null, revision1, userId)
    expect((await saveWorkingCopy(input({ expectedRevision: revision1, revision: revision2 }))).data?.revision).toBe(revision2)
    expect(rows).toHaveLength(1)
    expect((await saveWorkingCopy(input({ expectedRevision: revision1 }))).conflict).toBe(true)
    expect(rows[0].revision).toBe(revision2)
  })
  it('loads a leftover new-document copy after that document becomes an owned post', async () => {
    await saveWorkingCopy(input({ documentId: postId }))
    expect((await loadWorkingCopy(postId, postId, userId)).data?.values.content).toBe('Private writing')
  })
  it('enforces UTF-8 bytes for multibyte drafts before attempting a write', async () => {
    const result = await saveWorkingCopy(input({ values: { ...draftValues(), content: '界'.repeat(250_001) } }))
    expect(result.error).toContain('too large')
    expect(writes).toEqual([])
  })
  it('creates new-document working copies and reloads every form field', async () => {
    expect((await saveWorkingCopy(input())).data?.values.content).toBe('Private writing')
    expect((await loadWorkingCopy(documentId, null, userId)).data?.revision).toBe(revision1)
    expect(rows[0].user_id).toBe(userId)
    expect(writes).toEqual([{ table: 'post_working_copies', operation: 'insert' }])
  })
  it('autosaves edits to published posts without writing posts, tags or notifications', async () => {
    const result = await saveWorkingCopy(input({ documentId: postId, postId }))
    expect(result.data?.values.content).toBe('Private writing')
    expect(posts[0].content).toBe('Public content')
    expect(writes.every(write => write.table === 'post_working_copies')).toBe(true)
  })
  it('rejects stale revisions and preserves the winning tab', async () => {
    await saveWorkingCopy(input())
    await saveWorkingCopy(input({ expectedRevision: revision1, revision: revision2, values: { ...draftValues(), content: 'Winning tab' } }))
    const stale = await saveWorkingCopy(input({ expectedRevision: revision1 }))
    expect(stale.conflict).toBe(true)
    expect(rows[0].values).toMatchObject({ content: 'Winning tab' })
  })
  it('does not replace an existing copy on an initial insert from another tab', async () => {
    await saveWorkingCopy(input())
    expect((await saveWorkingCopy(input({ revision: revision2 }))).conflict).toBe(true)
    expect(rows[0].revision).toBe(revision1)
  })
  it('acknowledges an already persisted request when its response was lost', async () => {
    loseAcknowledgement = true
    expect((await saveWorkingCopy(input())).data?.revision).toBe(revision1)
    expect(rows).toHaveLength(1)
  })
  it('requires authentication, valid input and ownership of the referenced post', async () => {
    vi.mocked(getProfile).mockResolvedValueOnce(null)
    expect((await saveWorkingCopy(input())).error).toMatch(/session expired/)
    posts[0].author_id = 'someone-else'
    expect((await saveWorkingCopy(input({ documentId: postId, postId }))).error).toBeDefined()
    expect((await saveWorkingCopy(input({ documentId: 'not-a-uuid' }))).error).toBeDefined()
    expect(writes).toEqual([])
  })
  it('rejects an account switch instead of saving the previous author’s writing into another account', async () => {
    vi.mocked(getProfile).mockResolvedValue({ id: 'another-account', role: 'admin' } as Awaited<ReturnType<typeof getProfile>>)
    expect((await saveWorkingCopy(input())).error).toContain('account changed')
    expect(writes).toEqual([])
  })
  it('allows admins to keep a private copy while editing another author’s post', async () => {
    posts[0].author_id = 'someone-else'
    vi.mocked(getProfile).mockResolvedValue({ id: userId, role: 'admin' } as Awaited<ReturnType<typeof getProfile>>)
    expect((await saveWorkingCopy(input({ documentId: postId, postId }))).data).toBeDefined()
  })
  it('deletes only the acknowledged revision, preserving changes made by another tab', async () => {
    await saveWorkingCopy(input())
    await saveWorkingCopy(input({ expectedRevision: revision1, revision: revision2 }))
    await discardWorkingCopy(documentId, null, revision1, userId)
    expect(rows).toHaveLength(1)
    await discardWorkingCopy(documentId, null, revision2, userId)
    expect(rows).toHaveLength(0)
  })
  it('does not load a different author’s recovery', async () => {
    await saveWorkingCopy(input())
    rows[0].user_id = 'someone-else'
    expect((await loadWorkingCopy(documentId, null, userId)).data).toBeUndefined()
  })
})
