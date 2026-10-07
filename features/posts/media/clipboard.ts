/** Rich text applications can include an image rendition alongside the copied text. */
export function pastedImageFile(data: DataTransfer | null): File | undefined {
  if (!data || data.getData('text/html') || data.getData('text/plain')) return undefined
  return Array.from(data.files)[0]
}
