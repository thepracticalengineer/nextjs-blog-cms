/** Shared by insertion, persistence, HTML import and public rendering. No network fetches. */
export const VIDEO_URL_ERROR = 'Enter a YouTube watch or youtu.be link, or a direct HTTPS .mp4 or .webm URL.'
export const VIDEO_CONTENT_ERROR = 'This article contains an unsupported video. Reinsert it using Insert or edit video with a YouTube link or direct HTTPS MP4/WebM URL. Legacy video markup with source children is not supported.'
export const VIDEO_HELP = 'Playback depends on the host and browser. If unavailable, open the source; YouTube owners may disable embedding.'
export type VideoUrl = { type: 'youtube' | 'video'; src: string; source: string }

export function parseVideoUrl(value: unknown): VideoUrl | null {
  if (typeof value !== 'string' || !value || value.length > 8192 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const host = url.hostname
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1)
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/embed\/([^/]+)$/.exec(url.pathname)?.[1] ?? null
    } else if (host === 'www.youtube-nocookie.com' || host === 'youtube-nocookie.com') {
      id = /^\/embed\/([^/]+)$/.exec(url.pathname)?.[1] ?? null
    } else if (/\.(mp4|webm)$/i.test(url.pathname)) {
      return { type: 'video', src: url.href, source: url.href }
    }
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) return null
    return { type: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}`, source: `https://www.youtube.com/watch?v=${id}` }
  } catch { return null }
}

/** Iframes accept embed paths only; watch links are input URLs, not iframe sources. */
export function parseYoutubeEmbed(value: unknown): VideoUrl | null {
  const parsed = parseVideoUrl(value)
  if (parsed?.type !== 'youtube' || !/^\/embed\/[\w-]{11}$/.test(new URL(value as string).pathname)) return null
  return parsed
}

export function videoAttributes(video: VideoUrl): Record<string, string> {
  return video.type === 'youtube'
    ? { src: video.src, title: 'YouTube video player', loading: 'lazy', allow: 'encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin', class: 'article-video-player' }
    : { src: video.src, controls: '', preload: 'none', playsinline: '', title: 'Video player', class: 'article-video-player' }
}

/** Preserve legacy content while rejecting invalid video JSON before any write. */
export function hasValidVideoNodes(content: unknown): boolean {
  if (typeof content !== 'string') return content == null
  let doc: unknown
  try { doc = JSON.parse(content) } catch { return true }
  const walk = (node: unknown, depth: number): boolean => {
    if (!node || typeof node !== 'object') return true
    if (depth > 64) return false
    const item = node as { type?: string; attrs?: { src?: unknown }; content?: unknown[] }
    if (item.type === 'video' || item.type === 'youtube') {
      if (parseVideoUrl(item.attrs?.src)?.type !== item.type) return false
    }
    return !Array.isArray(item.content) || item.content.every(child => walk(child, depth + 1))
  }
  return walk(doc, 0)
}
