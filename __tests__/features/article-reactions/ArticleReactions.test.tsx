import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ArticleReactions } from '@/features/article-reactions/ArticleReactions'
import { setArticleReaction } from '@/features/article-reactions/actions'
import { readArticleReactions } from '@/features/article-reactions/client'
import { useReactionSession } from '@/features/comments/reaction-client'
vi.mock('@/features/article-reactions/actions',()=>({setArticleReaction:vi.fn()}))
vi.mock('@/features/article-reactions/client',()=>({readArticleReactions:vi.fn()}))
vi.mock('@/features/comments/reaction-client',()=>({useReactionSession:vi.fn()}))
const id='15300000-0000-4000-8000-000000000010'
const zero={counts:{love:0,unicorn:0,mind_blown:0,celebrate:0,fire:0},selections:[]}
const loved={counts:{...zero.counts,love:1},selections:['love' as const]}
const both={counts:{...zero.counts,love:1,fire:1},selections:['love' as const,'fire' as const]}
function ui(initialData: typeof zero | typeof loved | null=zero){return <ArticleReactions postId={id} returnPath="/blog/example#article-reactions" initialData={initialData} initialViewerId="reader" />}
async function open(){fireEvent.click(screen.getByRole('button',{name:'Add reaction'}));await screen.findByRole('button',{name:'Love: 0 reactions'})}
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(useReactionSession).mockReturnValue({viewerId:'reader',loading:false})
 vi.mocked(readArticleReactions).mockResolvedValue({data:zero,viewerId:'reader'})
 vi.mocked(setArticleReaction).mockResolvedValue({data:loved})
})
afterEach(()=>vi.useRealTimers())
describe('article reactions',()=>{
 it('shows authoritative zero totals and a named picker',async()=>{
  render(ui());expect(screen.getByText('0 reactions')).toBeInTheDocument()
  await open()
  expect(screen.getByRole('group',{name:'Choose article reactions'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Mind blown: 0 reactions'})).toHaveAttribute('aria-pressed','false')
 })
 it('adds multiple types independently and removes only the chosen type',async()=>{
  render(ui());await open()
  fireEvent.click(screen.getByRole('button',{name:'Love: 0 reactions'}))
  await screen.findByRole('button',{name:'Love: 1 reaction',pressed:true})
  vi.mocked(setArticleReaction).mockResolvedValue({data:both})
  fireEvent.click(screen.getByRole('button',{name:'Fire: 0 reactions'}))
  await screen.findByRole('button',{name:'Fire: 1 reaction',pressed:true})
  expect(screen.getByRole('button',{name:'Love: 1 reaction'})).toHaveAttribute('aria-pressed','true')
  expect(screen.getByText('2 reactions')).toBeInTheDocument()
  vi.mocked(setArticleReaction).mockResolvedValue({data:{counts:{...zero.counts,fire:1},selections:['fire']}})
  fireEvent.click(screen.getByRole('button',{name:'Love: 1 reaction'}))
  await screen.findByRole('button',{name:'Love: 0 reactions',pressed:false})
  expect(setArticleReaction).toHaveBeenLastCalledWith(id,'love',false)
  expect(screen.getByRole('button',{name:'Fire: 1 reaction'})).toHaveAttribute('aria-pressed','true')
 })
 it('opens the guest login modal without changing counts and preserves the return URL',async()=>{
  vi.mocked(useReactionSession).mockReturnValue({viewerId:null,loading:false})
  render(ui());await open()
  fireEvent.click(screen.getByRole('button',{name:'Love: 0 reactions'}))
  expect(await screen.findByRole('dialog',{name:'Log in to continue'})).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Log in'})).toHaveAttribute('href','/login?next=%2Fblog%2Fexample%23article-reactions')
  expect(screen.getByRole('link',{name:'Create account'})).toHaveAttribute('href','/register?next=%2Fblog%2Fexample%23article-reactions')
  expect(setArticleReaction).not.toHaveBeenCalled()
  expect(screen.getByText('0 reactions')).toBeInTheDocument()
 })
 it('prevents repeated activation during a pending save',async()=>{
  let finish!: (result:{data:typeof loved})=>void
  vi.mocked(setArticleReaction).mockReturnValue(new Promise(resolve=>{finish=resolve}))
  render(ui());await open()
  const button=screen.getByRole('button',{name:'Love: 0 reactions'})
  fireEvent.click(button);fireEvent.click(button)
  expect(setArticleReaction).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()
  await act(async()=>finish({data:loved}))
 })
 it('reconciles uncertain writes and retries the original desired state',async()=>{
  render(ui());await open()
  vi.mocked(setArticleReaction).mockResolvedValueOnce({error:'Connection lost'})
  vi.mocked(readArticleReactions).mockResolvedValue({data:loved,viewerId:'reader'})
  fireEvent.click(screen.getByRole('button',{name:'Love: 0 reactions'}))
  await screen.findByRole('button',{name:'Love: 1 reaction',pressed:true})
  fireEvent.click(screen.getByRole('button',{name:'Retry reaction'}))
  await waitFor(()=>expect(setArticleReaction).toHaveBeenLastCalledWith(id,'love',true))
 })
 it('ignores a read started before a successful write',async()=>{
  let finish!: (result:{data:typeof zero;viewerId:string})=>void
  vi.mocked(readArticleReactions).mockReturnValue(new Promise(resolve=>{finish=resolve}))
  render(ui());await open()
  fireEvent.click(screen.getByRole('button',{name:'Love: 0 reactions'}))
  await screen.findByRole('button',{name:'Love: 1 reaction',pressed:true})
  await act(async()=>finish({data:zero,viewerId:'reader'}))
  expect(screen.getByText('1 reaction')).toBeInTheDocument()
 })
 it('isolates private selections and late writes across account changes',async()=>{
  let finish!: (result:{data:typeof loved})=>void
  vi.mocked(setArticleReaction).mockReturnValue(new Promise(resolve=>{finish=resolve}))
  const view=render(ui());await open()
  fireEvent.click(screen.getByRole('button',{name:'Love: 0 reactions'}))
  vi.mocked(useReactionSession).mockReturnValue({viewerId:'other',loading:false})
  vi.mocked(readArticleReactions).mockResolvedValue({data:loved,viewerId:'reader'})
  view.rerender(ui())
  await act(async()=>finish({data:loved}))
  fireEvent.click(screen.getByRole('button',{name:'Add reaction'}))
  await screen.findByRole('button',{name:'Love: 1 reaction',pressed:false})
 })
 it('shows unavailable counts instead of a false zero and can retry reads',async()=>{
  vi.mocked(readArticleReactions).mockResolvedValue({error:'Could not refresh reactions. Try again.'})
  render(ui(null))
  expect(screen.queryByText('0 reactions')).not.toBeInTheDocument()
  await screen.findByRole('button',{name:'Refresh reactions'})
  vi.mocked(readArticleReactions).mockResolvedValue({data:zero,viewerId:'reader'})
  fireEvent.click(screen.getByRole('button',{name:'Refresh reactions'}))
  await screen.findByText('0 reactions')
 })
 it('hides old counts when an article becomes unavailable',async()=>{
  vi.mocked(readArticleReactions).mockResolvedValue({data:null,viewerId:'reader'})
  render(ui(loved))
  await screen.findByText('This article is no longer available for reactions.')
  expect(screen.queryByText('1 reaction')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Add reaction'})).toBeDisabled()
 })
 it('does not offer retries for permanent authorization failures',async()=>{
  vi.mocked(setArticleReaction).mockResolvedValue({error:'Complete two-factor authentication',retryable:false})
  render(ui());await open()
  fireEvent.click(screen.getByRole('button',{name:'Love: 0 reactions'}))
  await screen.findByText('Complete two-factor authentication')
  expect(screen.queryByRole('button',{name:'Retry reaction'})).not.toBeInTheDocument()
 })
 it('times out a hung save and ignores its late response',async()=>{
  render(ui());await open()
  vi.useFakeTimers()
  let finish!: (result:{data:typeof loved})=>void
  vi.mocked(setArticleReaction).mockReturnValue(new Promise(resolve=>{finish=resolve}))
  fireEvent.click(screen.getByRole('button',{name:'Love: 0 reactions'}))
  await act(async()=>{await vi.advanceTimersByTimeAsync(15_001)})
  expect(screen.getByRole('button',{name:'Retry reaction'})).toBeEnabled()
  await act(async()=>finish({data:loved}))
  expect(screen.getByRole('button',{name:'Love: 0 reactions'})).toHaveAttribute('aria-pressed','false')
 })
 it('refreshes concurrent totals on focus',async()=>{
  render(ui());await open()
  vi.mocked(readArticleReactions).mockResolvedValue({data:both,viewerId:'reader'})
  fireEvent(window,new Event('focus'))
  await screen.findByText('2 reactions')
 })
 it('polls only while visible and coalesces focus/visibility refreshes',async()=>{
  vi.useFakeTimers()
  render(ui())
  await act(async()=>{})
  vi.mocked(readArticleReactions).mockClear()
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'})
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_101)})
  expect(readArticleReactions).not.toHaveBeenCalled()
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})
  fireEvent(window,new Event('focus'))
  fireEvent(document,new Event('visibilitychange'))
  await act(async()=>{await vi.advanceTimersByTimeAsync(101)})
  expect(readArticleReactions).toHaveBeenCalledTimes(1)
  await act(async()=>{await vi.advanceTimersByTimeAsync(30_101)})
  expect(readArticleReactions).toHaveBeenCalledTimes(2)
 })

})
