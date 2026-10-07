import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EditorContent } from '@/components/editor/EditorContent'

// ── Helper: build minimal TipTap JSON ────────────────────────────────────────
function doc(content: object[]) {
  return JSON.stringify({ type: 'doc', content })
}
function p(text: string, marks: object[] = []) {
  return { type: 'paragraph', content: [{ type: 'text', text, marks }] }
}

// ── sanitizeColor (tested indirectly via textStyle mark) ─────────────────────
describe('EditorContent — textStyle color sanitization', () => {
  it('renders valid 6-digit hex color', () => {
    const json = doc([p('hello', [{ type: 'textStyle', attrs: { color: '#ef4444' } }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('span[style*="color: #ef4444"]')).not.toBeNull()
  })

  it('renders valid 3-digit hex color', () => {
    const json = doc([p('hello', [{ type: 'textStyle', attrs: { color: '#f00' } }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('span[style*="color: #f00"]')).not.toBeNull()
  })

  it('strips invalid color value (XSS attempt)', () => {
    const json = doc([p('hello', [{ type: 'textStyle', attrs: { color: 'red; background: url(x)' } }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('span[style]')).toBeNull()
    expect(container.textContent).toContain('hello')
  })

  it('strips 5-digit hex (not valid CSS)', () => {
    const json = doc([p('hello', [{ type: 'textStyle', attrs: { color: '#12345' } }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('span[style]')).toBeNull()
  })
})

describe('EditorContent — new inline marks', () => {
  it('renders underline mark as <u>', () => {
    const json = doc([p('text', [{ type: 'underline' }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('u')).not.toBeNull()
  })

  it('renders subscript mark as <sub>', () => {
    const json = doc([p('H2O', [{ type: 'subscript' }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('sub')).not.toBeNull()
  })

  it('renders superscript mark as <sup>', () => {
    const json = doc([p('E=mc2', [{ type: 'superscript' }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('sup')).not.toBeNull()
  })

  it('renders highlight with valid color as <mark>', () => {
    const json = doc([p('text', [{ type: 'highlight', attrs: { color: '#fef9c3' } }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('mark[style*="background-color: #fef9c3"]')).not.toBeNull()
  })

  it('renders highlight without color as plain <mark>', () => {
    const json = doc([p('text', [{ type: 'highlight', attrs: { color: null } }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('mark')).not.toBeNull()
  })
})

describe('EditorContent — link href sanitization', () => {
  it('allows https links', () => {
    const json = doc([p('click', [{ type: 'link', attrs: { href: 'https://example.com' } }])])
    const { container } = render(<EditorContent content={json} />)
    // URL normalization adds trailing slash to bare origins
    expect(container.querySelector('a[href="https://example.com/"]')).not.toBeNull()
  })

  it('allows mailto links', () => {
    const json = doc([p('mail', [{ type: 'link', attrs: { href: 'mailto:a@b.com' } }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('a[href="mailto:a@b.com"]')).not.toBeNull()
  })

  it('strips javascript: href', () => {
    const json = doc([p('xss', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('xss')
  })
})

describe('EditorContent — image src sanitization', () => {
  it('renders image with https src', () => {
    const json = doc([{ type: 'image', attrs: { src: 'https://img.example.com/a.jpg', alt: '' } }])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('omits image with javascript: src', () => {
    const json = doc([{ type: 'image', attrs: { src: 'javascript:alert(1)', alt: '' } }])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('EditorContent — paragraph/heading textAlign', () => {
  it('renders paragraph with text-align style', () => {
    const json = doc([{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'hello' }] }])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('p[style*="text-align: center"]')).not.toBeNull()
  })

  it('merges lineHeight and textAlign into one style attribute', () => {
    const json = doc([{ type: 'paragraph', attrs: { lineHeight: '2', textAlign: 'right' }, content: [{ type: 'text', text: 'hello' }] }])
    const { container } = render(<EditorContent content={json} />)
    const p = container.querySelector('p')
    expect(p?.getAttribute('style')).toContain('line-height:2')
    expect(p?.getAttribute('style')).toContain('text-align: right')
  })

  it('rejects invalid textAlign value', () => {
    const json = doc([{ type: 'paragraph', attrs: { textAlign: 'malicious' }, content: [{ type: 'text', text: 'hello' }] }])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('p[style*="text-align"]')).toBeNull()
  })
})

describe('EditorContent — task list', () => {
  it('renders taskList as <ul> with checkbox items', () => {
    const json = doc([{
      type: 'taskList',
      content: [{
        type: 'taskItem',
        attrs: { checked: true },
        content: [p('done')]
      }, {
        type: 'taskItem',
        attrs: { checked: false },
        content: [p('todo')]
      }]
    }])
    const { container } = render(<EditorContent content={json} />)
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toHaveAttribute('checked')
    expect(checkboxes[1]).not.toHaveAttribute('checked')
    expect(checkboxes[0]).toHaveAttribute('disabled')
  })
})

describe('EditorContent — table', () => {
  it('renders table with tbody structure', () => {
    const json = doc([{
      type: 'table',
      content: [{
        type: 'tableRow',
        content: [
          { type: 'tableHeader', content: [p('Name')] },
          { type: 'tableHeader', content: [p('Value')] },
        ]
      }, {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [p('foo')] },
          { type: 'tableCell', content: [p('bar')] },
        ]
      }]
    }])
    const { container } = render(<EditorContent content={json} />)
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelector('tbody')).not.toBeNull()
    expect(container.querySelector('th')).not.toBeNull()
    expect(container.querySelector('td')).not.toBeNull()
  })
})


describe('inline image layout metadata', () => {
  it('preserves escaped alt text and safe intrinsic dimensions with lazy loading', () => {
    const content = doc([{ type: 'image', attrs: { src: 'https://images.example.com/circuit.webp', alt: 'Ports labeled "A" & "B"', width: 800, height: 600 } }])
    const { container } = render(<EditorContent content={content} />)
    const image = container.querySelector('img')!
    expect(image).toHaveAttribute('alt', 'Ports labeled "A" & "B"')
    expect(image).toHaveAttribute('width', '800')
    expect(image).toHaveAttribute('height', '600')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
  })
  it('drops malformed dimensions', () => {
    const content = doc([{ type: 'image', attrs: { src: 'https://images.example.com/circuit.webp', width: '8" onerror="alert(1)', height: -1 } }])
    const { container } = render(<EditorContent content={content} />)
    expect(container.querySelector('img')).not.toHaveAttribute('width')
    expect(container.querySelector('img')).not.toHaveAttribute('height')
  })
})
