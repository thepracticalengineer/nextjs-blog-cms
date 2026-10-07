import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SocialLinksForm } from '@/features/profile/components/SocialLinksForm'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/profile/actions', () => ({ updateProfile: vi.fn() }))

import { updateProfile } from '@/features/profile/actions'
const mockUpdateProfile = vi.mocked(updateProfile)

const fakeProfile = {
  twitter_url: 'https://twitter.com/frank',
  linkedin_url: null,
  github_url: null,
  instagram_url: null,
  facebook_url: null,
  youtube_url: null,
  tiktok_url: null,
}

beforeEach(() => { vi.clearAllMocks() })

describe('SocialLinksForm', () => {
  it.each(['ftp://example.com', 'mailto:author@example.com', 'https://user:pass@example.com'])('identifies an unsafe stored social link %s and allows correction', async (github_url) => {
    mockUpdateProfile.mockResolvedValue({ success: true })
    render(<SocialLinksForm profile={{ ...fakeProfile, github_url } as any} />)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a valid HTTP or HTTPS URL without credentials')
    expect(screen.getByLabelText('GitHub')).toHaveAttribute('aria-invalid', 'true')
    expect(mockUpdateProfile).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('GitHub'), { target: { value: 'https://github.com/author' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledOnce())
  })

  it('highlights the social input named in server validation errors', async () => {
    mockUpdateProfile.mockResolvedValue({ error: 'Check profile fields', fieldErrors: { twitter_url: ['Invalid public URL'] } })
    render(<SocialLinksForm profile={fakeProfile as any} />)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid public URL')
    expect(screen.getByLabelText(/twitter/i)).toHaveAccessibleDescription('Invalid public URL')
  })

  it('renders all 7 social link inputs', () => {
    render(<SocialLinksForm profile={fakeProfile as any} />)
    expect(screen.getByLabelText(/twitter/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/linkedin/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/github/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/instagram/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/facebook/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/youtube/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/tiktok/i)).toBeInTheDocument()
  })

  it('pre-fills existing social links', () => {
    render(<SocialLinksForm profile={fakeProfile as any} />)
    expect(screen.getByDisplayValue('https://twitter.com/frank')).toBeInTheDocument()
  })

  it('renders a Save Changes button', () => {
    render(<SocialLinksForm profile={fakeProfile as any} />)
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('calls updateProfile on submit and normalizes empty strings to null', async () => {
    mockUpdateProfile.mockResolvedValue({ success: true })
    render(<SocialLinksForm profile={fakeProfile as any} />)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledOnce())
    // All null fields should be passed as null, pre-filled twitter_url as its value
    const callArg = mockUpdateProfile.mock.calls[0][0] as Record<string, string | null>
    expect(callArg.twitter_url).toBe('https://twitter.com/frank')
    expect(callArg.linkedin_url).toBeNull()
  })

  it('shows error toast when updateProfile fails', async () => {
    mockUpdateProfile.mockResolvedValue({ error: 'Save failed' })
    render(<SocialLinksForm profile={fakeProfile as any} />)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledOnce())
  })
})
