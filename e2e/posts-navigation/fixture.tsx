import React from 'react'
import { createRoot } from 'react-dom/client'
import { Sidebar } from '@/components/dashboard/Sidebar'
import type { Profile } from '@/lib/supabase/types'
import '../../app/globals.css'
const profile = { id: 'fixture', email: 'author@example.test', full_name: 'Test Author', avatar_url: null, role: new URLSearchParams(location.search).get('role') ?? 'admin' } as Profile
createRoot(document.getElementById('root')!).render(<Sidebar profile={profile} />)
