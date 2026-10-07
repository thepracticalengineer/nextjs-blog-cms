import { imageFileError, type ImageValue } from './validation'

export async function validateImageUrl(url: string, editorId: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/post-media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, editorId }), signal })
  const result = await response.json().catch(() => { throw new Error('Image validation failed. Check your connection and retry.') })
  if (!response.ok || typeof result.src !== 'string') throw new Error(result.error ?? 'Image validation failed. Retry when connected.')
  return result.src
}

export function uploadImage(file: File, editorId: string, onProgress: (percent: number) => void, signal: AbortSignal): Promise<ImageValue> {
  const error = imageFileError(file)
  if (error) return Promise.reject(new Error(error))
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    signal.addEventListener('abort', abort, { once: true })
    const finish = () => signal.removeEventListener('abort', abort)
    xhr.open('POST', '/api/post-media')
    xhr.timeout = 120_000
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    xhr.onload = () => {
      finish()
      try {
        const result = JSON.parse(xhr.responseText)
        if (xhr.status < 200 || xhr.status >= 300 || typeof result.src !== 'string') throw new Error(result.error ?? 'Image upload failed. Retry when connected.')
        resolve({ ...result, alt: '' })
      } catch (error) { reject(error instanceof SyntaxError ? new Error('Image upload failed. Check your connection and retry.') : error) }
    }
    xhr.onerror = xhr.ontimeout = () => { finish(); reject(new Error('Image upload failed. Check your connection and retry. Your writing is preserved.')) }
    xhr.onabort = () => { finish(); reject(new Error('Image upload cancelled. Your writing is preserved.')) }
    const form = new FormData()
    form.set('file', file)
    form.set('editorId', editorId)
    if (signal.aborted) { finish(); reject(new Error('Image upload cancelled.')); return }
    xhr.send(form)
  })
}

export function readImageDimensions(src: string, signal: AbortSignal): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = window.setTimeout(() => fail(), 15_000)
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', fail); img.onload = null; img.onerror = null }
    const fail = () => { cleanup(); reject(new Error('This image could not be loaded. Check the URL and its public access, or upload a file instead.')) }
    img.onload = () => { cleanup(); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = fail
    signal.addEventListener('abort', fail, { once: true })
    if (signal.aborted) { fail(); return }
    img.src = src
  })
}
