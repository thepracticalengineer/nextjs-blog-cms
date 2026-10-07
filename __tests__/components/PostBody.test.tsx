import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostBody } from '@/components/editor/PostBody'

describe('article cover descriptions', () => {
  it.each([undefined, null, ''])('falls back to the title for missing alt %s', coverImageAlt => {
    render(<PostBody title="Article title" coverImage="/cover.png" coverImageAlt={coverImageAlt} content="" />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Article title')
  })

  it('uses the saved image description', () => {
    render(<PostBody title="Article title" coverImage="/cover.png" coverImageAlt="An annotated circuit" content="" />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'An annotated circuit')
  })
})
