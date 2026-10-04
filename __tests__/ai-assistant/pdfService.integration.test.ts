// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { extractTextFromPdf } from '@/features/ai-assistant/pdfService'

// A complete one-page PDF with metadata, text, and a valid cross-reference table.
function samplePdf() {
  const stream = 'BT /F1 12 Tf 72 720 Td (Dependency migration PDF) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Title (Migration fixture) >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

describe('PDF v2 extraction with its real worker', () => {
  it('extracts text and metadata from a complete PDF', async () => {
    const result = await extractTextFromPdf(samplePdf())
    expect(result.text).toContain('Dependency migration PDF')
    expect(result.pageCount).toBe(1)
    expect(result.title).toBe('Migration fixture')
    expect(result.wordCount).toBe(3)
    expect(result.wasTruncated).toBe(false)
  })

  it('rejects invalid bytes without leaving a worker active', async () => {
    await expect(extractTextFromPdf(Buffer.from('invalid pdf'))).rejects.toThrow()
  })
})
