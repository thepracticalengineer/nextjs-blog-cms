import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/context/AuthProvider'
import { useProfile } from '@/features/auth/hooks/useProfile'
import { useSession } from '@/features/auth/hooks/useSession'

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: mocks, from: mocks.from }) }))

type Callback = (event: AuthChangeEvent, session: Session | null) => void | Promise<void>
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
type ProfileResult = { data: { id: string; full_name: string } | null; error: { message: string } | null }
let queries: (ReturnType<typeof deferred<ProfileResult>> & { id: string; signal?: AbortSignal })[]
let subscriptions: { callback: Callback; unsubscribe: ReturnType<typeof vi.fn> }[]
let initialization: ReturnType<typeof deferred<{ data: { session: Session | null }; error: { message: string } | null }>>
let insideCallback: boolean

function session(id: string, token = 'token'): Session {
  return { access_token: token, refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer',
    user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' } }
}
function Probe() {
  const { session, user, loading } = useSession()
  const profile = useProfile()
  const { error, refreshProfile } = profile
  return <>
    <output data-testid="user">{user?.id ?? 'none'}</output>
    <output data-testid="token">{session?.access_token ?? 'none'}</output>
    <output data-testid="profile">{profile.profile?.full_name ?? 'none'}</output>
    <output data-testid="loading">{String(loading)}</output>
    <output data-testid="error">{error ?? ''}</output>
    <button onClick={refreshProfile}>Refresh profile</button>
  </>
}
function mount(strict = false) {
  const tree = <AuthProvider><Probe /></AuthProvider>
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}
async function initialize(value: Session | null = session('A')) {
  await act(async () => { initialization.resolve({ data: { session: value }, error: null }) })
}
function emit(event: AuthChangeEvent, value: Session | null) {
  let result: void | Promise<void>
  act(() => {
    insideCallback = true
    try { result = subscriptions.at(-1)!.callback(event, value) } finally { insideCallback = false }
  })
  return result!
}
async function respond(index: number, id: string, name = id) {
  await act(async () => { queries[index].resolve({ data: { id, full_name: name }, error: null }) })
}
const value = (name: string) => screen.getByTestId(name).textContent

beforeEach(() => {
  vi.resetAllMocks()
  queries = []
  subscriptions = []
  insideCallback = false
  initialization = deferred()
  mocks.getSession.mockReturnValue(initialization.promise)
  mocks.onAuthStateChange.mockImplementation((callback: Callback) => {
    const subscription = { callback, unsubscribe: vi.fn() }
    subscriptions.push(subscription)
    return { data: { subscription } }
  })
  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe('profiles')
    const query = Object.assign(deferred<ProfileResult>(), { id: '', signal: undefined as AbortSignal | undefined })
    const builder = {
      select: (columns: string) => { expect(columns).toBe('*'); return builder },
      eq: (column: string, id: string) => { expect(column).toBe('id'); query.id = id; return builder },
      abortSignal: (signal: AbortSignal) => { query.signal = signal; return builder },
      single: () => { queries.push(query); return query.promise },
    }
    return builder
  })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('profile identity and request lifetime', () => {
  it('clears immediately on logout and ignores the old response', async () => {
    mount(); await initialize()
    emit('SIGNED_OUT', null)
    expect(value('profile')).toBe('none')
    await respond(0, 'A')
    expect(value('user')).toBe('none')
    expect(value('profile')).toBe('none')
    expect(value('loading')).toBe('false')
  })
  it('clears a loaded profile on account switch and waits for the new identity', async () => {
    mount(); await initialize(); await respond(0, 'A')
    emit('SIGNED_IN', session('B'))
    expect(value('user')).toBe('B')
    expect(value('profile')).toBe('none')
    expect(value('loading')).toBe('true')
    expect(queries[1].id).toBe('B')
    await respond(1, 'B')
    expect(value('profile')).toBe('B')
  })
  it('does not let an older account response overwrite the current profile', async () => {
    mount(); await initialize()
    emit('SIGNED_IN', session('B'))
    await respond(1, 'B'); await respond(0, 'A')
    expect(value('user')).toBe('B')
    expect(value('profile')).toBe('B')
  })
  it('invalidates A even when switching A to B to A within one batch', async () => {
    mount(); await initialize()
    act(() => {
      subscriptions[0].callback('SIGNED_IN', session('B'))
      subscriptions[0].callback('SIGNED_IN', session('A', 'new-token'))
    })
    await respond(0, 'A', 'old profile')
    expect(value('profile')).toBe('none')
    expect(queries).toHaveLength(2)
    await respond(1, 'A', 'fresh profile')
    expect(value('profile')).toBe('fresh profile')
  })
  it('aborts pending work and unsubscribes on unmount', async () => {
    const view = mount(); await initialize()
    view.unmount()
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledOnce()
    expect(queries[0].signal?.aborted).toBe(true)
    await respond(0, 'A')
    expect(queries).toHaveLength(1)
  })
  it('does not start profile work after initialization resolves on an unmounted provider', async () => {
    const view = mount(); view.unmount(); await initialize()
    expect(queries).toHaveLength(0)
    act(() => { subscriptions[0].callback('SIGNED_IN', session('B')) })
    expect(queries).toHaveLength(0)
  })
  it('does not restore an initial session after a newer logout event', async () => {
    mount(); emit('SIGNED_OUT', null); await initialize()
    expect(value('user')).toBe('none')
    expect(queries).toHaveLength(0)
  })
  it('does not replace an event identity with a delayed initialization result', async () => {
    mount(); emit('SIGNED_IN', session('B')); await initialize()
    expect(value('user')).toBe('B')
    expect(queries.map(query => query.id)).toEqual(['B'])
    await respond(0, 'B')
  })
  it('survives Strict Mode cleanup and remount without accepting stale callbacks', async () => {
    mount(true); await initialize()
    expect(subscriptions).toHaveLength(2)
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledOnce()
    act(() => { subscriptions[0].callback('SIGNED_OUT', null) })
    expect(value('user')).toBe('A')
    expect(queries).toHaveLength(1)
    await respond(0, 'A')
    expect(value('profile')).toBe('A')
  })
})

describe('auth events and explicit profile refresh', () => {
  it('does not notify context consumers when a parent rerenders with unchanged auth state', async () => {
    const renders = vi.fn()
    function ObservedProfile() {
      const { profile } = useProfile()
      renders(profile?.full_name ?? 'none')
      return <output>{profile?.full_name ?? 'none'}</output>
    }
    const child = <ObservedProfile />
    const view = render(<AuthProvider>{child}</AuthProvider>)
    await initialize(); await respond(0, 'A')
    expect(screen.getByText('A')).toBeInTheDocument()
    renders.mockClear()
    view.rerender(<AuthProvider>{child}</AuthProvider>)
    expect(renders).not.toHaveBeenCalled()
    expect(queries).toHaveLength(1)
  })
  it('returns synchronously and never starts a profile query inside the auth callback', async () => {
    mount(); await initialize(null)
    const original = mocks.from.getMockImplementation()!
    mocks.from.mockImplementation((...args) => { expect(insideCallback).toBe(false); return original(...args) })
    expect(emit('SIGNED_IN', session('A'))).toBeUndefined()
    await respond(0, 'A')
  })
  it.each(['initialization-first', 'event-first'])('deduplicates INITIAL_SESSION with getSession: %s', async order => {
    mount()
    if (order === 'initialization-first') { await initialize(); emit('INITIAL_SESSION', session('A')) }
    else { emit('INITIAL_SESSION', session('A')); await initialize() }
    expect(queries).toHaveLength(1)
    await respond(0, 'A')
  })
  it('updates session tokens without refetching on repeated same-user events', async () => {
    mount(); await initialize(); await respond(0, 'A')
    for (const event of ['TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED', 'INITIAL_SESSION'] as const) {
      emit(event, session('A', event))
      expect(value('token')).toBe(event)
      expect(value('profile')).toBe('A')
      expect(value('loading')).toBe('false')
    }
    expect(queries).toHaveLength(1)
  })
  it('explicit refresh clears old data and supersedes in-flight requests', async () => {
    mount(); await initialize()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }))
    expect(queries).toHaveLength(2)
    expect(queries[0].signal?.aborted).toBe(true)
    await respond(1, 'A', 'updated'); await respond(0, 'A', 'obsolete')
    expect(value('profile')).toBe('updated')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }))
    expect(value('profile')).toBe('none')
    expect(value('loading')).toBe('true')
    expect(queries).toHaveLength(3)
    await respond(2, 'A', 'latest')
    expect(value('profile')).toBe('latest')
  })
  it('does not query profiles when refreshing while signed out', async () => {
    mount(); await initialize(null)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }))
    expect(queries).toHaveLength(0)
    expect(value('loading')).toBe('false')
  })
})

describe('finite failures and manual retry', () => {
  it.each(['INITIAL_SESSION', 'SIGNED_IN'] as const)('recovers from initialization timeout on a late %s without manual retry', async event => {
    vi.useFakeTimers()
    mount()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(value('loading')).toBe('false')
    expect(value('error')).not.toBe('')
    // A timed-out lookup must stay obsolete, while a fresh event may recover.
    await initialize(session('A'))
    expect(value('user')).toBe('none')
    expect(queries).toHaveLength(0)
    emit(event, session('B'))
    expect(value('error')).toBe('')
    expect(value('user')).toBe('B')
    expect(value('loading')).toBe('true')
    expect(queries.map(query => query.id)).toEqual(['B'])
    await respond(0, 'B')
    expect(value('profile')).toBe('B')
    expect(value('loading')).toBe('false')
    expect(mocks.getSession).toHaveBeenCalledOnce()
    expect(subscriptions).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['returned', 'rejected', 'missing'])('ends loading after a %s profile failure and allows retry', async kind => {
    mount(); await initialize()
    await act(async () => {
      if (kind === 'rejected') queries[0].reject(new Error('PRIVATE details'))
      else queries[0].resolve({ data: null, error: kind === 'returned' ? { message: 'PRIVATE details' } : null })
    })
    expect(value('loading')).toBe('false')
    expect(value('profile')).toBe('none')
    expect(value('error')).toMatch(/profile/i)
    expect(value('error')).not.toContain('PRIVATE')
    emit('TOKEN_REFRESHED', session('A'))
    expect(queries).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }))
    expect(value('error')).toBe('')
    expect(value('loading')).toBe('true')
    await respond(1, 'A')
    expect(value('error')).toBe('')
    expect(value('profile')).toBe('A')
  })
  it('times out a stalled profile request, aborts it and ignores a late response', async () => {
    vi.useFakeTimers()
    mount(); await initialize()
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(value('loading')).toBe('false')
    expect(value('error')).toMatch(/profile/i)
    expect(queries[0].signal?.aborted).toBe(true)
    await respond(0, 'A')
    expect(value('profile')).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }))
    await respond(1, 'A')
    expect(value('profile')).toBe('A')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears errors on logout and does not let an obsolete failure replace a new profile', async () => {
    mount(); await initialize()
    emit('SIGNED_IN', session('B')); await respond(1, 'B')
    await act(async () => { queries[0].reject(new Error('old request')) })
    expect(value('error')).toBe('')
    expect(value('profile')).toBe('B')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }))
    await act(async () => { queries[2].resolve({ data: null, error: { message: 'failure' } }) })
    expect(value('error')).not.toBe('')
    emit('SIGNED_OUT', null)
    expect(value('error')).toBe('')
    expect(value('profile')).toBe('none')
  })
  it.each(['returned', 'rejected', 'timeout'])('ends loading after %s initialization failure and retries explicitly', async kind => {
    vi.useFakeTimers()
    mount()
    await act(async () => {
      if (kind === 'returned') initialization.resolve({ data: { session: null }, error: { message: 'PRIVATE' } })
      else if (kind === 'rejected') initialization.reject(new Error('PRIVATE'))
      else await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(value('loading')).toBe('false')
    expect(value('error')).not.toBe('')
    expect(value('error')).not.toContain('PRIVATE')
    const retry = deferred<{ data: { session: Session | null }; error: null }>()
    mocks.getSession.mockReturnValueOnce(retry.promise)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh profile' }))
    expect(value('loading')).toBe('true')
    expect(value('error')).toBe('')
    await act(async () => { retry.resolve({ data: { session: session('A') }, error: null }) })
    await respond(0, 'A')
    expect(value('error')).toBe('')
    expect(value('profile')).toBe('A')
  })
  it('ignores initialization failures after an auth event has supplied the session', async () => {
    mount(); emit('SIGNED_IN', session('B'))
    await act(async () => { initialization.reject(new Error('late failure')) })
    await respond(0, 'B')
    expect(value('user')).toBe('B')
    expect(value('error')).toBe('')
  })
})
