import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ save: vi.fn(), replace: vi.fn() }))
vi.mock('@/features/onboarding/actions', () => ({ saveOnboarding: mocks.save }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }) }))
import { OnboardingForm } from '@/features/onboarding/OnboardingForm'
const progress = { user_id: 'owner', step: 0, revision: 0, full_name: null, profile_name: 'Jane', experience: '', profession: '', referral: '', interests: [], return_to: '/blog', completed_at: null }
const props = { progress, profile: { full_name: 'Jane', email: 'jane@example.com', avatar_url: null }, tags: [{ id: '00000000-0000-4000-8000-000000000001', name: 'TypeScript' }] }
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockImplementation(async data => ({ progress: { ...progress, ...data, revision: data.revision + 1, completed_at: data.complete ? 'today' : null } })) })
it('prefills profile details and keeps answers after a failed save for retry', async () => {
  const user = userEvent.setup()
  render(<OnboardingForm {...props} />)
  expect(screen.getByLabelText('Full name')).toHaveValue('Jane')
  await user.click(screen.getByLabelText('1–3 years'))
  await user.click(screen.getByLabelText('Software engineer'))
  mocks.save.mockResolvedValueOnce({ error: 'Unable to save. Try again.' })
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save')
  expect(screen.getByLabelText('Software engineer')).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('heading', { name: 'How did you find us?' })).toHaveFocus()
})
it('skips optional referral, searches and selects interests, and navigates only after completion', async () => {
  const user = userEvent.setup()
  render(<OnboardingForm {...props} progress={{ ...progress, step: 1, full_name: 'Jane', experience: '1-3', profession: 'software-engineer' }} />)
  await user.click(screen.getByRole('button', { name: 'Skip this question' }))
  await screen.findByLabelText('Search topics')
  fireEvent.change(screen.getByLabelText('Search topics'), { target: { value: 'type' } })
  await user.click(screen.getByRole('button', { name: 'TypeScript' }))
  expect(screen.getByRole('button', { name: 'TypeScript' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Finish setup' }))
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/blog'))
})
it('offers a reload on conflicting progress and blocks duplicate save clicks', async () => {
  const user = userEvent.setup()
  render(<OnboardingForm {...props} progress={{ ...progress, step: 2, full_name: 'Jane', experience: '1-3', profession: 'software-engineer', interests: [props.tags[0].id] }} />)
  mocks.save.mockResolvedValue({ conflict: true, error: 'Reload to continue.' })
  await user.click(screen.getByRole('button', { name: 'Finish setup' }))
  expect(await screen.findByRole('button', { name: 'Reload saved progress' })).toBeVisible()
  expect(mocks.replace).not.toHaveBeenCalled()
})

it('issues one request when Continue is activated twice while saving', async () => {
  let finish!: (value: { error: string }) => void
  mocks.save.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { container } = render(<OnboardingForm {...props} progress={{ ...progress, full_name: 'Jane', experience: '1-3', profession: 'software-engineer' }} />)
  fireEvent.submit(container.querySelector('form')!)
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  finish({ error: 'Please retry.' })
  expect(await screen.findByRole('alert')).toHaveTextContent('Please retry.')
})

it('allows completion without interests when no active topics exist', async () => {
  const user = userEvent.setup()
  render(<OnboardingForm {...props} tags={[]} progress={{ ...progress, step: 2, full_name: 'Jane', experience: 'learning', profession: 'student' }} />)
  expect(screen.getByText('Topics are still being prepared. You can finish without choosing interests.')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Finish setup' }))
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/blog'))
})

it('prefers a newer profile name on reload while retaining a draft when the profile is unchanged', () => {
  const draft = { ...progress, full_name: 'Draft name', profile_name: 'Jane' }
  const first = render(<OnboardingForm {...props} progress={draft} />)
  expect(screen.getByLabelText('Full name')).toHaveValue('Draft name')
  first.unmount()
  render(<OnboardingForm {...props} profile={{ ...props.profile, full_name: 'New profile name' }} progress={draft} />)
  expect(screen.getByLabelText('Full name')).toHaveValue('New profile name')
  expect(screen.getByText('Your profile name changed since your last save. We have filled in the latest name.')).toBeVisible()
})

it.each([{ interests: [] }, { interests: ['00000000-0000-4000-8000-000000000001'] }])('does not submit setup when Enter is pressed in topic search (selections %j)', async ({ interests }) => {
  const user = userEvent.setup()
  render(<OnboardingForm {...props} progress={{ ...progress, step: 2, full_name: 'Jane', experience: 'learning', profession: 'student', interests }} />)
  await user.type(screen.getByLabelText('Search topics'), 'type{Enter}')
  expect(mocks.save).not.toHaveBeenCalled()
  expect(mocks.replace).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Search topics')).toHaveValue('type')
})
