import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PageEditor } from '@/features/pages/editor/PageEditor'
import { PageContent } from '@/features/pages/PageContent'
import { type PageDocument } from '@/features/pages/document'
import '@/app/globals.css'
import { AuthContext, type AuthContextType } from '@/features/auth/context/AuthContext'
const auth = { user: { id: 'page-fixture' }, loading: false } as AuthContextType

const initial: PageDocument = { version: 1, blocks: [{ type: 'paragraph', text: 'First' }, { type: 'paragraph', text: 'Second' }] }
const layout: PageDocument = { version: 2, content: { type: 'doc', content: [{ type: 'section', attrs: { width: 'full', padding: 'sm', background: 'muted' }, content: [{ type: 'columns', attrs: { preset: 'wide-left', gap: 'md', padding: 'none' }, content: [{ type: 'column', attrs: { padding: 'none' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wide column ' + 'long'.repeat(80) }] }] }, { type: 'column', attrs: { padding: 'none' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Narrow column' }] }] }] }] }] } }
const whitespace = 'First  spaced\nSecond line'
const whitespaceV1: PageDocument = { version: 1, blocks: [{ type: 'paragraph', text: whitespace }] }
const whitespaceV2: PageDocument = { version: 2, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: whitespace }] }, { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: whitespace }] }] } }
function Fixture() {
  const [document, setDocument] = useState<PageDocument>(initial)
  const [saved, setSaved] = useState<PageDocument>(initial)
  const [revision, setRevision] = useState(0)
  const load = (value: PageDocument) => { setDocument(value); setRevision(value => value + 1) }
  return <main style={{ maxWidth: 1200, margin: '0 auto', padding: 8 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <button onClick={() => setSaved(JSON.parse(JSON.stringify(document)))}>Save fixture</button>
      <button onClick={() => load(JSON.parse(JSON.stringify(saved)))}>Reload saved</button>
      <button onClick={() => load(layout)}>Load layout fixture</button>
      <button onClick={() => load(whitespaceV1)}>Load legacy whitespace</button>
      <button onClick={() => load(whitespaceV2)}>Load rich whitespace</button>
    </div>
    <PageEditor key={revision} document={document} editorId="page-fixture" onChange={setDocument} />
    <output aria-label="Saved document" style={{ display: 'none' }}>{JSON.stringify(saved)}</output>
    <section aria-label="Published fixture"><PageContent document={saved} /></section>
  </main>
}
createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth}><Fixture /></AuthContext.Provider>)
