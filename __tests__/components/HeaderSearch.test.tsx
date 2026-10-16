import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeaderSearch } from '@/components/HeaderSearch'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

it('returns keyboard focus to the search trigger after Escape', async () => {
  const user = userEvent.setup()
  render(<HeaderSearch />)
  await user.click(screen.getByRole('button', { name: 'Search' }))
  const input = screen.getByRole('textbox', { name: 'Search articles' })
  await user.click(input)
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus()
})
