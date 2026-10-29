import React from 'react'
import { createRoot } from 'react-dom/client'
import { PageManager } from '@/features/pages/management/PageManager'
import { AuthContext, type AuthContextType } from '@/features/auth/context/AuthContext'
import '@/app/globals.css'
import { fixturePage, accountId } from './data'
const params = new URLSearchParams(location.search)
const auth = { user: { id: accountId }, loading: false } as AuthContextType
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth}><main className="mx-auto max-w-6xl p-3"><PageManager accountId={accountId} documentId={params.get('draft') ?? accountId} initialPage={params.has('draft') ? null : fixturePage} /></main></AuthContext.Provider>)
