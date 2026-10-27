import sanitizeHtml from 'sanitize-html'
import { parseVideoUrl, parseYoutubeEmbed, videoAttributes, hasValidVideoNodes } from './editor-video'

export function sanitizeEditorHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'input', 's', 'u', 'mark', 'iframe', 'video'],
    allowedAttributes: { '*': ['class', 'style'], a: ['href', 'rel', 'target'], img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'], input: ['type', 'disabled', 'checked'], iframe: ['src', 'title', 'allowfullscreen', 'referrerpolicy', 'class', 'loading', 'allow'], video: ['src', 'controls', 'preload', 'playsinline', 'title', 'class'] },
    allowedStyles: { '*': {
      color: [/^#[a-f\d]{3,8}$/i, /^rgba?\([\d\s.,]+\)$/],
      background: [/^#[a-f\d]{3,8}$/i],
      'background-color': [/^#[a-f\d]{3,8}$/i, /^rgba?\([\d\s.,]+\)$/],
      padding: [/^[\d.]+(?:px|rem)(?: [\d.]+(?:px|rem))?$/, /^0$/],
      margin: [/^[\d.]+(?:px|rem)(?: (?:0|[\d.]+(?:px|rem)))*$/],
      'border-radius': [/^[\d.]+(?:px|rem)$/],
      'font-size': [/^[\d.]+(?:px|rem|em)$/],
      'font-family': [/^monospace$/],
      'overflow-x': [/^auto$/],
      'line-height': [/^[\d.]+$/],
      'text-align': [/^(?:left|center|right|justify)$/],
    } },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'], iframe: ['https'], video: ['https'] },
    allowProtocolRelative: false,
    allowedIframeHostnames: ['www.youtube-nocookie.com'],
    exclusiveFilter: frame => ['iframe', 'video'].includes(frame.tag) && !frame.attribs.src,
    transformTags: {
      iframe: (_tag, attrs) => { const video = parseYoutubeEmbed(attrs.src); return { tagName: 'iframe', attribs: video ? videoAttributes(video) : {} } },
      video: (_tag, attrs) => { const video = parseVideoUrl(attrs.src); return { tagName: 'video', attribs: video?.type === 'video' ? videoAttributes(video) : {} } }, a: (_tag, attrs) => {
        const { target, ...rest } = attrs
        return { tagName: 'a', attribs: { ...rest, rel: 'noopener noreferrer', ...(target === '_blank' ? { target } : {}) } }
      }, input: sanitizeHtml.simpleTransform('input', { type: 'checkbox', disabled: 'disabled' }) },
  })
}

/** Validate legacy media too, without rejecting existing non-media HTML. */
export function hasValidVideoContent(content: unknown): boolean {
  if (!hasValidVideoNodes(content)) return false
  if (typeof content !== 'string') return true
  try { JSON.parse(content); return true } catch { /* Legacy HTML. */ }
  let valid = true
  sanitizeHtml(content, {
    allowedTags: ['iframe', 'video'],
    transformTags: {
      iframe: (tagName, attribs) => { if (!parseYoutubeEmbed(attribs.src)) valid = false; return { tagName, attribs } },
      video: (tagName, attribs) => { if (parseVideoUrl(attribs.src)?.type !== 'video') valid = false; return { tagName, attribs } },
    },
  })
  return valid
}
