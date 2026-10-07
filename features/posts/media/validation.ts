// Leave multipart framing room within the deployment function payload limit.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_IMAGE_DIMENSION = 2400
export const MAX_STORED_IMAGE_BYTES = 2 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',')
export type ImageValue = { src: string; alt: string; width?: number; height?: number }

export function imageFileError(file: { size: number; type: string }): string | undefined {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Choose a JPEG, PNG or WebP image. SVG, GIF and other file types are not supported.'
  if (!file.size) return 'This file is empty. Choose another image.'
  if (file.size > MAX_IMAGE_BYTES) return 'This image exceeds 4 MB. Choose a smaller file.'
}

export function imageDimension(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 && n <= 100_000 ? n : undefined
}
