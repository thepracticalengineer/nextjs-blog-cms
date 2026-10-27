import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorContent, useEditor } from '@tiptap/react'
import { extensions } from '@/components/editor/extensions'
import { Toolbar } from '@/components/editor/Toolbar'
import { renderEditorHtml } from '@/components/editor/EditorContent'
import { sanitizeEditorHtml } from '@/lib/editor-html'
import '@/app/globals.css'
function Fixture() {
  const [rendered, setRendered] = useState('')
  const editor = useEditor({ extensions, content: JSON.parse(localStorage.getItem('video-draft') ?? 'null') ?? '<p>Hello <strong>world</strong></p>' })
  useEffect(() => {
    if (!editor) return
    const replace = () => editor.commands.setContent('<p>Externally changed writing</p>')
    window.addEventListener('replace-content', replace)
    return () => window.removeEventListener('replace-content', replace)
  }, [editor])
  if (!editor) return null
  return <main className="mx-auto max-w-3xl p-4"><Toolbar editor={editor} onImage={() => {}} /><EditorContent editor={editor} />
    <button onClick={() => editor.commands.undo()}>Undo</button>
    <button onClick={() => editor.commands.redo()}>Redo</button>
    <button onClick={() => { localStorage.setItem('video-draft', JSON.stringify(editor.getJSON())); setRendered(renderEditorHtml(JSON.stringify(editor.getJSON()))) }}>Save draft</button>
    <section aria-label="Published article" dangerouslySetInnerHTML={{ __html: rendered }} />
    <section aria-label="Article preview" dangerouslySetInnerHTML={{ __html: sanitizeEditorHtml(rendered) }} />
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
