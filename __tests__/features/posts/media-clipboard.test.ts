import { describe, expect, it } from 'vitest'
import { pastedImageFile } from '@/features/posts/media/clipboard'

describe('clipboard media selection', () => {
  const file = new File(['image'], 'image.png', { type: 'image/png' })
  it('accepts a file-only paste', () => {
    expect(pastedImageFile({ files: [file], getData: () => '' } as unknown as DataTransfer)).toBe(file)
  })
  it.each(['text/html', 'text/plain'])('gives %s priority over an image rendition', type => {
    expect(pastedImageFile({ files: [file], getData: (format: string) => format === type ? 'Text' : '' } as unknown as DataTransfer)).toBeUndefined()
  })
  it('ignores empty or missing clipboard data', () => {
    expect(pastedImageFile(null)).toBeUndefined()
    expect(pastedImageFile({ files: [], getData: () => '' } as unknown as DataTransfer)).toBeUndefined()
  })
})
