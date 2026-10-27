export interface MediaAsset {
  id: string
  url: string
  original_filename: string | null
  title: string
  alt_text: string
  caption: string
  description: string
  width: number | null
  height: number | null
  byte_size: number | null
  uploaded_at: string | null
  archived_at: string | null
}
export interface MediaLibraryPage { assets: MediaAsset[]; total: number; page: number; pageSize: number }
export type MediaMetadata = Pick<MediaAsset, 'title' | 'alt_text' | 'caption' | 'description'>
