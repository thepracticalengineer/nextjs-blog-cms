import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ImageDialog } from '@/components/editor/ImageDialog'
import '@/app/globals.css'
function Fixture() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')
  return <main>
    <button onClick={() => setOpen(true)}>Choose image</button>
    <output aria-label="Applied image">{saved}</output>
    {open && <ImageDialog cover={!new URLSearchParams(location.search).has('inline')} editorId="test-owner"
      onClose={() => setOpen(false)} onSave={image => setSaved(`${image.src}: ${image.alt}`)} />}
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
