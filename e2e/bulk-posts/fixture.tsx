import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { PostTable } from '@/components/dashboard/PostTable'
import { parseDashboardListState, dashboardListUrl } from '@/features/posts/list-state'
import { rows } from './stubs'
import '@/app/globals.css'
function Fixture() {
  const [, render] = useState(0)
  useEffect(() => {
    const refresh = () => render(count => count + 1)
    addEventListener('fixture-refresh', refresh)
    addEventListener('popstate', refresh)
    return () => { removeEventListener('fixture-refresh', refresh); removeEventListener('popstate', refresh) }
  }, [])
  const params = Object.fromEntries(new URLSearchParams(location.search))
  const state = parseDashboardListState({ size: '5', ...params })
  const filtered = rows.filter(row => row.title.toLowerCase().includes(state.search.toLowerCase()))
  state.page = Math.min(state.page, Math.max(1, Math.ceil(filtered.length / state.pageSize)))
  return <main className="p-4"><h1>Posts</h1>
    <PostTable key={dashboardListUrl(state)} posts={filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize)} total={filtered.length} categories={[]} state={state} />
    <Toaster />
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
