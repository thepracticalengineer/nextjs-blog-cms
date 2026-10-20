import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentReactionProvider } from '@/features/comments/components/CommentReactionProvider'
import { CommentReactions } from '@/features/comments/components/CommentReactions'
import { AuthContext, type AuthContextType } from '@/features/auth/context/AuthContext'
import { setCommentReaction } from '@/features/comments/reaction-actions'
import { readCommentReactions } from '@/features/comments/reaction-client'
vi.mock('@/features/comments/reaction-actions', () => ({ setCommentReaction: vi.fn() }))
vi.mock('@/features/comments/reaction-client', async () => {
 const {useAuth}=await import('@/features/auth/context/AuthContext')
 return {readCommentReactions:vi.fn(),useReactionSession:()=>{
  const {user,loading}=useAuth()
  return {viewerId:user?.id??null,loading}
 }}
})
const id = '15900000-0000-4000-8000-000000000020'
const zero = { counts: { like: 0, love: 0, celebrate: 0, insightful: 0 }, selection: null }
const liked = { counts: { like: 1, love: 0, celebrate: 0, insightful: 0 }, selection: 'like' as const }
function ui(viewer: string | null = 'reader', loading = false) {
 return <AuthContext.Provider value={{ user: viewer ? { id: viewer } : null, loading } as AuthContextType}>
  <CommentReactionProvider postId={id} initialData={{ [id]: zero }} initialViewerId="reader" returnPath="/blog/example#comments">
   <CommentReactions commentId={id} />
  </CommentReactionProvider>
 </AuthContext.Provider>
}
beforeEach(() => {
 vi.clearAllMocks()
 vi.mocked(readCommentReactions).mockResolvedValue({ data: { [id]: zero }, viewerId: 'reader' })
 vi.mocked(setCommentReaction).mockResolvedValue({ data: liked })
})
afterEach(() => vi.useRealTimers())
describe('comment reaction controls', () => {
 it('renders zero counts with accessible names and pressed states', async () => {
  render(ui())
  expect(await screen.findByRole('button', { name: 'Like: 0 reactions' })).toHaveAttribute('aria-pressed','false')
  expect(screen.getByRole('button', { name: 'Insightful: 0 reactions' })).toBeEnabled()
 })
 it('adds and removes using explicit desired states', async () => {
  render(ui())
  fireEvent.click(screen.getByRole('button', { name: 'Like: 0 reactions' }))
  await waitFor(() => expect(screen.getByRole('button',{ name:'Like: 1 reaction' })).toHaveAttribute('aria-pressed','true'))
  vi.mocked(setCommentReaction).mockResolvedValue({ data: zero })
  fireEvent.click(screen.getByRole('button',{ name:'Like: 1 reaction' }))
  await waitFor(() => expect(setCommentReaction).toHaveBeenLastCalledWith(id,null))
  await waitFor(() => expect(screen.getByRole('button',{ name:'Like: 0 reactions' })).toHaveAttribute('aria-pressed','false'))
 })
 it('prevents duplicate activation while a save is pending', async () => {
  let finish!: (value: { data: typeof liked }) => void
  vi.mocked(setCommentReaction).mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(ui())
  const button = screen.getByRole('button',{ name:'Love: 0 reactions' })
  fireEvent.click(button); fireEvent.click(button)
  expect(setCommentReaction).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()
  await act(async () => { finish({ data: liked }) })
 })
 it('guides guests to sign in without writing or changing totals', () => {
  render(ui(null))
  fireEvent.click(screen.getByRole('button',{ name:'Love: 0 reactions' }))
  expect(screen.getByRole('link',{ name:'Sign in to react' })).toHaveAttribute('href',expect.stringContaining('/login'))
  expect(setCommentReaction).not.toHaveBeenCalled()
 })
 it('reconciles a lost response and retries the original desired state', async () => {
  vi.mocked(setCommentReaction).mockResolvedValueOnce({ error:'Connection lost' })
  vi.mocked(readCommentReactions).mockResolvedValue({ data: { [id]: liked }, viewerId:'reader' })
  render(ui())
  fireEvent.click(screen.getByRole('button',{ name:'Like: 0 reactions' }))
  await screen.findByText('Connection lost')
  await waitFor(() => expect(screen.getByRole('button',{ name:'Like: 1 reaction' })).toHaveAttribute('aria-pressed','true'))
  fireEvent.click(screen.getByRole('button',{ name:'Retry reaction' }))
  await waitFor(() => expect(setCommentReaction).toHaveBeenLastCalledWith(id,'like'))
 })
 it('refreshes concurrent counts when the window regains focus', async () => {
  render(ui())
  vi.mocked(readCommentReactions).mockResolvedValue({ data:{ [id]:{ ...zero,counts:{ ...zero.counts, love:3 } } },viewerId:'reader' })
  fireEvent(window,new Event('focus'))
  expect(await screen.findByRole('button',{name:'Love: 3 reactions'})).toBeInTheDocument()
 })
 it('clears private selection on account switch and ignores a late response', async () => {
  let finish!: (value: { data: typeof liked }) => void
  vi.mocked(setCommentReaction).mockReturnValue(new Promise(resolve => { finish=resolve }))
  const { rerender }=render(ui())
  fireEvent.click(screen.getByRole('button',{ name:'Like: 0 reactions' }))
  rerender(ui('other'))
  await act(async () => { finish({ data:liked }) })
  expect(screen.queryByRole('button',{name:'Like: 1 reaction',pressed:true})).not.toBeInTheDocument()
 })
 it('shows controls immediately for a comment added by a server refresh', async () => {
  const added = '15900000-0000-4000-8000-000000000021'
  const renderComments = (include: boolean) => <AuthContext.Provider value={{ user: { id: 'reader' }, loading: false } as AuthContextType}>
   <CommentReactionProvider postId={id} initialData={include ? { [id]: zero, [added]: zero } : { [id]: zero }} initialViewerId="reader" returnPath="/blog/example#comments">
    <CommentReactions commentId={id} />{include && <CommentReactions commentId={added} />}
   </CommentReactionProvider>
  </AuthContext.Provider>
  const { rerender } = render(renderComments(false))
  await act(async () => {})
  vi.mocked(readCommentReactions).mockReturnValue(new Promise(() => {}))
  rerender(renderComments(true))
  expect(screen.getAllByRole('button', { name: 'Like: 0 reactions' })).toHaveLength(2)
  expect(screen.queryByText('This comment is no longer available for reactions.')).not.toBeInTheDocument()
 })
 it('preserves a locally saved selection when stale RSC data introduces its comment', async () => {
  const added = '15900000-0000-4000-8000-000000000021'
  const oldInitial = { [id]: zero }
  const laterInitial = { ...oldInitial, [added]: zero }
  const renderComments = (initial: typeof oldInitial) => <AuthContext.Provider value={{ user: { id: 'reader' }, loading: false } as AuthContextType}>
   <CommentReactionProvider postId={id} initialData={initial} initialViewerId="reader" returnPath="/blog/example#comments"><CommentReactions commentId={added} /></CommentReactionProvider>
  </AuthContext.Provider>
  vi.mocked(readCommentReactions).mockResolvedValue({data:{[id]:zero,[added]:zero},viewerId:'reader'})
  const {rerender}=render(renderComments(oldInitial))
  fireEvent.click(await screen.findByRole('button',{name:'Like: 0 reactions'}))
  await screen.findByRole('button',{name:'Like: 1 reaction'})
  vi.mocked(readCommentReactions).mockReturnValue(new Promise(()=>{}))
  rerender(renderComments(laterInitial))
  expect(screen.getByRole('button',{name:'Like: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 })
 it('releases a hung write and ignores its eventual late success', async () => {
  vi.useFakeTimers()
  let finish!: (value: { data: typeof liked }) => void
  vi.mocked(setCommentReaction).mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(ui())
  fireEvent.click(screen.getByRole('button', { name: 'Like: 0 reactions' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(15_001) })
  expect(screen.getByRole('button', { name: 'Retry reaction' })).toBeEnabled()
  await act(async () => { finish({ data: liked }) })
  expect(screen.getByRole('button', { name: 'Like: 0 reactions' })).toHaveAttribute('aria-pressed', 'false')
 })
 it('does not offer retries for a permanently unavailable comment', async () => {
  vi.mocked(setCommentReaction).mockResolvedValue({error:'Comment unavailable',retryable:false})
  render(ui())
  fireEvent.click(screen.getByRole('button',{name:'Like: 0 reactions'}))
  await screen.findByText('Comment unavailable')
  expect(screen.queryByRole('button',{name:'Retry reaction'})).not.toBeInTheDocument()
 })
 it('coalesces focus and visibility reads and leaves the write independent', async () => {
  render(ui())
  await act(async()=>{})
  vi.mocked(readCommentReactions).mockClear()
  vi.mocked(readCommentReactions).mockReturnValue(new Promise(()=>{}))
  fireEvent(window,new Event('focus'))
  fireEvent(document,new Event('visibilitychange'))
  await waitFor(()=>expect(readCommentReactions).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button',{name:'Like: 0 reactions'}))
  expect(await screen.findByRole('button',{name:'Like: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 })
 it('returns guests to the comment section after sign-in',()=>{
  render(ui(null))
  fireEvent.click(screen.getByRole('button',{name:'Like: 0 reactions'}))
  expect(screen.getByRole('link',{name:'Sign in to react'})).toHaveAttribute('href','/login?next=%2Fblog%2Fexample%23comments')
 })
 it('keeps failed reads visible and offers a refresh', async () => {
  vi.mocked(readCommentReactions).mockResolvedValue({error:'Could not refresh reactions. Try again.'})
  render(ui())
  fireEvent(window,new Event('focus'))
  expect(await screen.findByRole('button',{name:'Refresh reactions'})).toBeInTheDocument()
 })
})
