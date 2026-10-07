import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TagSelector } from '@/features/taxonomy/TagSelector'
import type { Tag } from '@/lib/supabase/types'

const tags = [
  { id: '1', name: 'Software engineering', slug: 'software-engineering', created_at: null },
  { id: '2', name: 'TypeScript', slug: 'typescript', created_at: null },
  { id: '3', name: 'SoftwareEngineering', slug: 'softwareengineering', created_at: null, merged_into: '1' },
] satisfies Tag[]
function Selector() {
  const [ids, setIds] = useState(['1'])
  return <TagSelector tags={tags} selectedIds={ids} onToggle={id => setIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])} canManage />
}
describe('tag selection', () => {
  it('keeps selected tags visible during search and supports selecting and removing', () => {
    render(<Selector />)
    fireEvent.change(screen.getByLabelText('Search tags'), { target: { value: 'typescript' } })
    expect(screen.getByRole('button', { name: 'Remove tag Software engineering' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'TypeScript' }))
    expect(screen.getByRole('status')).toHaveTextContent('2 tags selected')
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag TypeScript' }))
    expect(screen.getByRole('button', { name: 'TypeScript' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('link', { name: /Manage tags/ })).toHaveAttribute('target', '_blank')
  })
  it('resolves old draft IDs without offering merged aliases', () => {
    render(<TagSelector tags={tags} selectedIds={['3', '1']} onToggle={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('1 tags selected')
    expect(screen.queryByRole('button', { name: 'SoftwareEngineering' })).not.toBeInTheDocument()
  })
  it('distinguishes load failures, empty taxonomy, and no search matches', () => {
    const { rerender } = render(<TagSelector tags={[]} selectedIds={[]} onToggle={() => {}} error />)
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.queryByText('No tags created yet.')).not.toBeInTheDocument()
    rerender(<TagSelector tags={[]} selectedIds={[]} onToggle={() => {}} />)
    expect(screen.getByText('No tags created yet.')).toBeInTheDocument()
    rerender(<TagSelector tags={tags} selectedIds={[]} onToggle={() => {}} />)
    fireEvent.change(screen.getByLabelText('Search tags'), { target: { value: 'missing' } })
    expect(screen.getByText('No matching unselected tags.')).toBeInTheDocument()
  })
})
