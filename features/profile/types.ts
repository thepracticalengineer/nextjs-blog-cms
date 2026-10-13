export type ProfileFormData = {
  full_name: string
  pronouns: string
  bio: string
  company: string
  location: string
  website: string
}

export type SocialLinksFormData = {
  twitter_url: string
  linkedin_url: string
  github_url: string
  instagram_url: string
  facebook_url: string
  youtube_url: string
  tiktok_url: string
}

export type PasswordChangeResult = {
  success?: true
  error?: string
  reauthenticationRequired?: true
  codeSent?: true
}
