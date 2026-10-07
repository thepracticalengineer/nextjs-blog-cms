import { describe, expect, it } from 'vitest'
import { publicationErrors, readableText, readableArticleText, validatePublication } from '@/features/posts/publication'
import { postClient, validPost } from '../../helpers/publication'

const errors = (changes = {}, reviewed: unknown = true) => publicationErrors({ ...validPost, ...changes }, 'Frank Mendez', reviewed)

describe('publication readiness', () => {
  it('accepts an engineering article about testing', () => { expect(errors()).toEqual({}) })
  it('counts TipTap JSON text without counting attributes or editor node names', () => {
    const doc = JSON.stringify({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'word '.repeat(199) }] },
      { type: 'image', attrs: { alt: 'word '.repeat(500) } },
      ...Array.from({ length: 300 }, () => ({ type: 'paragraph', content: [] })),
    ] })
    expect(errors({ content: doc }).content[0]).toContain('199')
    expect(readableArticleText(JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'lo' }, { type: 'text', text: 'rem ipsum', marks: [{ type: 'bold' }] },
    ] }] }))).toBe('lorem ipsum')
  })
  it('accepts substantive JSON articles and excludes empty or malformed documents', () => {
    expect(errors({ content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'word '.repeat(200) }] }] }) })).not.toHaveProperty('content')
    expect(errors({ content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }) })).toHaveProperty('content')
    expect(errors({ content: JSON.stringify({ irrelevant: 'word '.repeat(300) }) })).toHaveProperty('content')
  })
  it('requires all required fields and explicit human review', () => {
    expect(publicationErrors({}, null, 'true')).toHaveProperty('editorial_reviewed')
    expect(Object.keys(publicationErrors({}, null, false))).toEqual(expect.arrayContaining(['title', 'slug', 'content', 'excerpt', 'author_id']))
  })
  it.each(['', '   ', '<p><br></p>', '<div>&nbsp;&#160;&#xA0;</div>', '<!-- words -->', '<script>' + 'word '.repeat(300) + '</script>', '<style>' + 'word '.repeat(300) + '</style>'])('rejects non-readable body %s', content => {
    expect(errors({ content })).toHaveProperty('content')
  })
  it.each(['<div hidden>', '<p style="display:none">', '<div aria-hidden="true">', '<div class="hidden">'])('excludes hidden HTML body text %s', opening => {
    expect(errors({ content: opening + 'word '.repeat(300) + '</div>' })).toHaveProperty('content')
  })
  it('rejects inline placeholder assets in both article formats', () => {
    expect(errors({ content: validPost.content + '<img src="https://placehold.co/400x300">' })).toHaveProperty('content')
    const json = JSON.stringify({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'word '.repeat(200) }] },
      { type: 'image', attrs: { src: 'https://via.placeholder.com/400' } },
    ] })
    expect(errors({ content: json })).toHaveProperty('content')
  })
  it('does not count markup, entities or punctuation as words', () => {
    expect(errors({ content: '<p>' + '&nbsp; '.repeat(300) + '!!! '.repeat(300) + '</p>' })).toHaveProperty('content')
    expect(errors({ content: '<p>' + 'word '.repeat(199) + '</p>' }).content[0]).toContain('199')
    expect(errors({ content: '<p>' + 'word '.repeat(200) + '</p>' })).not.toHaveProperty('content')
  })
  it('decodes encoded and inline-marked placeholder text', () => {
    expect(readableText('<p>lo<strong>rem</strong> &#105;psum</p>')).toBe('lorem ipsum')
    expect(errors({ content: validPost.content + '<p>lo<strong>rem</strong> &#105;psum</p>' })).toHaveProperty('content')
  })
  it.each(['hello this is for test', 'Test Post', 'Untitled Article', 'E2E Published Post'])('blocks obvious placeholder title %s', title => {
    expect(errors({ title })).toHaveProperty('title')
  })
  it('requires human review for ambiguous unfinished-content flags', () => {
    const content = validPost.content + '<p>The test detects TODO comments in source code.</p>'
    expect(errors({ content }, false)).toHaveProperty('content')
    expect(errors({ content }, true)).toEqual({})
  })
  it('blocks unfinished templates even after review', () => {
    expect(errors({ excerpt: '[insert your summary here]' })).toHaveProperty('excerpt')
  })
  it.each(['BAD SLUG', 'a--b', '-slug', 'x'.repeat(201)])('rejects invalid slug %s', slug => {
    expect(errors({ slug })).toHaveProperty('slug')
  })
  it('requires a named author and rejects placeholder assets', () => {
    expect(publicationErrors(validPost, ' ', true)).toHaveProperty('author_id')
    expect(errors({ cover_image: 'https://placehold.co/800x400' })).toHaveProperty('cover_image')
  })
  it('checks slug conflicts while excluding the current post', async () => {
    const { client } = postClient([validPost])
    expect(await validatePublication(client, validPost, true)).toHaveProperty('slug')
    expect(await validatePublication(client, validPost, true, validPost.id)).toEqual({})
  })
})
