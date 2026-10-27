import { describe, expect, it } from 'vitest'
import { renderEditorHtml } from '@/components/editor/EditorContent'

describe('video rendering boundaries', () => {
  it('renders privacy-enhanced YouTube and native direct players', () => {
    const html = renderEditorHtml(JSON.stringify({ type: 'doc', content: [
      { type: 'youtube', attrs: { src: 'https://youtu.be/aqz-KE-bpKQ' } },
      { type: 'video', attrs: { src: 'https://media.example/movie.webm?token=one&part=2' } },
    ] }))
    expect(html).toContain('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ')
    expect(html).toContain('<video')
    expect(html).toContain('controls')
    expect(html).toContain('token=one&amp;part=2')
    expect(html).not.toContain('autoplay')
  })
  it('rejects arbitrary legacy iframes and executable video URLs', () => {
    const html = renderEditorHtml('<iframe src="https://evil.example/embed/a"></iframe><video src="javascript:alert(1)" autoplay></video><p>Keep text</p>')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('autoplay')
    expect(html).toContain('Keep text')
  })
})

import { parseVideoUrl, parseYoutubeEmbed, hasValidVideoNodes } from '@/lib/editor-video'
import { sanitizeEditorHtml } from '@/lib/editor-html'
import { Editor } from '@tiptap/core'
import { extensions } from '@/components/editor/extensions'

describe('video URL policy', () => {
  it.each(['https://www.youtube.com/watch?v=aqz-KE-bpKQ&autoplay=1', 'https://youtu.be/aqz-KE-bpKQ?t=5', 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1'])('canonicalizes %s without playback overrides', url => {
    expect(parseVideoUrl(url)?.src).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ')
  })
  it.each(['javascript:alert(1)', 'data:video/mp4,test', '//host/movie.mp4', 'http://host/movie.mp4', 'https://host/movie.mov', 'https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ', 'https://evil.test/embed/aqz-KE-bpKQ', 'https://youtube.com/watch?v=bad', 'https://user:pass@host/movie.mp4', 'https://host:8443/movie.mp4', 'https://host/white space.mp4', 'https://host/vid\neo.mp4', 'https://host\\evil/movie.mp4'])('rejects %s', url => {
    expect(parseVideoUrl(url)).toBeNull()
  })
  it('preserves signed direct URL query strings and accepts case insensitive extensions', () => {
    const src = 'https://cdn.example/Film.MP4?signature=a%2Fb&expires=123'
    expect(parseVideoUrl(src)).toEqual({ type: 'video', src, source: src })
    expect(parseYoutubeEmbed('https://www.youtube.com/watch?v=aqz-KE-bpKQ')).toBeNull()
  })
  it('validates nested persisted nodes and their type', () => {
    expect(hasValidVideoNodes(JSON.stringify({ type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'video', attrs: { src: 'javascript:x' } }] }] }))).toBe(false)
    expect(hasValidVideoNodes(JSON.stringify({ type: 'youtube', attrs: { src: 'https://host/video.mp4' } }))).toBe(false)
    expect(hasValidVideoNodes('<p>Legacy writing</p>')).toBe(true)
  })
})

describe('Tiptap video serialization', () => {
  it('roundtrips JSON and HTML with controls, no autoplay and safe public/preview rendering', () => {
    const editor = new Editor({ extensions, content: '<p>Hello <strong>world</strong></p>' })
    editor.commands.setYoutubeVideo({ src: 'https://youtu.be/aqz-KE-bpKQ' })
    editor.commands.insertContent({ type: 'video', attrs: { src: 'https://cdn.example/movie.mp4?x=1&y=2', autoplay: true } })
    const json = editor.getJSON()
    const html = editor.getHTML()
    const restored = new Editor({ extensions, content: json })
    expect(restored.getJSON()).toEqual(json)
    const imported = new Editor({ extensions, content: html })
    expect(imported.getJSON()).toEqual(json)
    const rendered = renderEditorHtml(JSON.stringify(json))
    for (const output of [html, rendered, sanitizeEditorHtml(rendered)]) {
      expect(output).toContain('youtube-nocookie.com/embed/aqz-KE-bpKQ')
      expect(output).toContain('controls')
      expect(output).not.toContain('autoplay')
      expect(output).toContain('<strong>world</strong>')
    }
    imported.destroy(); restored.destroy(); editor.destroy()
  })
  it('rejects unsafe HTML and command inputs', () => {
    const editor = new Editor({ extensions, content: '<div data-youtube-video><iframe src="https://evil.test/embed/aqz-KE-bpKQ"></iframe></div><video src="javascript:x"></video>' })
    expect(editor.getHTML()).not.toMatch(/iframe|video/)
    expect(editor.commands.setYoutubeVideo({ src: 'https://evil.test/embed/aqz-KE-bpKQ' })).toBe(false)
    editor.destroy()
  })
})

import { hasValidVideoContent } from '@/lib/editor-html'
it('validates legacy media at persistence boundaries', () => {
  expect(hasValidVideoContent('<iframe src="https://evil.test/embed/a"></iframe>')).toBe(false)
  expect(hasValidVideoContent('<video src="javascript:x"></video>')).toBe(false)
  expect(hasValidVideoContent('<video src="https://cdn.example/a.mp4"></video>')).toBe(true)
  expect(hasValidVideoContent('<iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ"></iframe>')).toBe(true)
  expect(hasValidVideoContent('<p>Legacy text <a href="https://example.com">link</a></p>')).toBe(true)
})
it('preserves accepted legacy YouTube iframe HTML when reopening and saving', () => {
  const editor = new Editor({ extensions, content: '<p>Keep writing</p><iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ?autoplay=1"></iframe>' })
  const saved = JSON.stringify(editor.getJSON())
  expect(saved).toContain('"type":"youtube"')
  expect(saved).toContain('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ')
  expect(renderEditorHtml(saved)).toContain('YouTube video player')
  expect(saved).not.toContain('autoplay')
  editor.destroy()
})
