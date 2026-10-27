import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MediaDashboard } from '@/features/posts/media/components/MediaDashboard'
import { ImageDialog } from '@/components/editor/ImageDialog'
import '@/app/globals.css'
import { AuthContext, type AuthContextType } from '@/features/auth/context/AuthContext'
const auth = { user: { id: 'test-owner' }, loading: false } as AuthContextType
function Fixture() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')
  return <main className="mx-auto max-w-5xl"><MediaDashboard editorId="test-owner" /><button onClick={() => setOpen(true)}>Choose cover</button><output aria-label="Applied image">{saved}</output>{open && <ImageDialog editorId="test-owner" cover onClose={() => setOpen(false)} onSave={image => setSaved(`${image.src}: ${image.alt}`)} />}</main>
}
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth}><Fixture /></AuthContext.Provider>)
