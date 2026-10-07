import type { Profile } from '@/lib/supabase/types'

export type PublicAuthor = Pick<Profile,
  'id' | 'full_name' | 'avatar_url' | 'bio' | 'website' |
  'twitter_url' | 'linkedin_url' | 'github_url' | 'instagram_url' |
  'facebook_url' | 'youtube_url' | 'tiktok_url'
>
