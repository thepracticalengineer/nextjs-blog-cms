import 'server-only'
import sharp from 'sharp'
import { imageFileError, MAX_IMAGE_PIXELS, MAX_IMAGE_DIMENSION, MAX_STORED_IMAGE_BYTES } from './validation'

function hasAnimationControl(bytes: Buffer, format: string): boolean {
  // libvips can decode the default frame of APNG without exposing pages. Inspect
  // actual chunk boundaries so APNG control chunks cannot silently become stills.
  if (format !== 'png' && format !== 'webp') return false
  let offset = format === 'png' ? 8 : 12
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset + (format === 'png' ? 4 : 0), offset + (format === 'png' ? 8 : 4))
    if (type === 'acTL' || type === 'ANIM') return true
    const length = format === 'png' ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset + 4)
    offset += format === 'png' ? length + 12 : length + 8 + (length % 2)
  }
  return false
}

export async function optimizeImage(file: File) {
  const error = imageFileError(file)
  if (error) throw new Error(error)
  const bytes = Buffer.from(await file.arrayBuffer())
  const decoder = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' })
  const metadata = await decoder.metadata()
  const types: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  if (!metadata.format || types[metadata.format] !== file.type || (metadata.pages ?? 1) > 1 || hasAnimationControl(bytes, metadata.format)) {
    throw new Error('The file content must be a non-animated JPEG, PNG or WebP image matching its file type.')
  }
  // Strip metadata and normalize orientation as part of re-encoding. No SVG decoder.
  const { data, info } = await decoder.rotate().resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true })
  if (data.length > MAX_STORED_IMAGE_BYTES) throw new Error('The optimized image exceeds 2 MB. Choose a simpler or smaller image.')
  return { data, width: info.width, height: info.height }
}
