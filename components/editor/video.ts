import { DOMSerializer, type DOMOutputSpec } from '@tiptap/pm/model'
import { Node, type NodeViewRenderer } from '@tiptap/core'
import Youtube from '@tiptap/extension-youtube'
import { parseVideoUrl, parseYoutubeEmbed, videoAttributes, VIDEO_HELP, type VideoUrl } from '@/lib/editor-video'

function output(video: VideoUrl | null): DOMOutputSpec {
  if (!video) return ['p', {}, 'Video unavailable: invalid URL.']
  return ['div', { 'data-article-video': video.type, ...(video.type === 'youtube' ? { 'data-youtube-video': '' } : {}) },
    [video.type === 'youtube' ? 'iframe' : 'video', videoAttributes(video)],
    ['p', { class: 'article-video-help' }, VIDEO_HELP, ' ', ['a', { href: video.source, target: '_blank', rel: 'noopener noreferrer' }, 'Open video source']],
  ]
}

const videoNodeView: NodeViewRenderer = ({ node, editor, getPos }) => {
  const parsed = parseVideoUrl(node.attrs.src)
  const { dom } = DOMSerializer.renderSpec(document, output(parsed?.type === node.type.name ? parsed : null))
  const element = dom as HTMLElement
  element.contentEditable = 'false'
  const select = document.createElement('button')
  select.type = 'button'
  select.textContent = 'Select video'
  select.className = 'text-sm underline mb-2'
  select.addEventListener('click', () => {
    const position = getPos()
    if (typeof position === 'number') editor.commands.setNodeSelection(position)
  })
  element.prepend(select)
  return { dom: element, stopEvent: event => event.target instanceof HTMLElement && (event.target.closest('button') !== null || event.target.tagName === 'VIDEO'), ignoreMutation: () => true }
}

export const DirectVideo = Node.create({
  addNodeView() { return videoNodeView },
  name: 'video', group: 'block', atom: true, draggable: true,
  addAttributes() { return { src: { default: null, parseHTML: element => parseVideoUrl((element.matches('video') ? element : element.querySelector('video'))?.getAttribute('src'))?.src ?? null } } },
  parseHTML() { return ['div[data-article-video=video]', 'video[src]'].map(tag => ({ tag, getAttrs: (element: HTMLElement) => {
    const video = parseVideoUrl((element.matches('video') ? element : element.querySelector('video'))?.getAttribute('src'))
    return video?.type === 'video' ? { src: video.src } : false
  } })) },
  renderHTML({ node }) { const video = parseVideoUrl(node.attrs.src); return output(video?.type === 'video' ? video : null) },
})

// Keep the official node/command API, but use the same strict boundary as saved content.
export const YoutubeVideo = Youtube.extend({
  addNodeView() { return videoNodeView },
  addAttributes() { return { ...this.parent?.(), src: { default: null, parseHTML: element => parseYoutubeEmbed((element.matches('iframe') ? element : element.querySelector('iframe'))?.getAttribute('src'))?.src ?? null } } },
  parseHTML() { return ['div[data-youtube-video]', 'iframe[src]'].map(tag => ({ tag, getAttrs: (element: HTMLElement) => {
    const video = parseYoutubeEmbed((element.matches('iframe') ? element : element.querySelector('iframe'))?.getAttribute('src'))
    return video ? { src: video.src } : false
  } })) },
  addCommands() { return { setYoutubeVideo: options => ({ commands }) => {
    const video = parseVideoUrl(options.src)
    return video?.type === 'youtube' ? commands.insertContent({ type: this.name, attrs: { src: video.src } }) : false
  } } },
  renderHTML({ node }) { const video = parseVideoUrl(node.attrs.src); return output(video?.type === 'youtube' ? video : null) },
}).configure({ nocookie: true, controls: true, autoplay: false, addPasteHandler: false })
