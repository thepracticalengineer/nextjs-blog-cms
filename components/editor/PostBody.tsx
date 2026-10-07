import Image from 'next/image'
import { EditorContent } from './EditorContent'

interface PostBodyProps {
  readonly title: string
  readonly coverImage?: string | null
  readonly excerpt?: string | null
  readonly content: string
}

// Shared by the public article and the private unsaved-input preview.
export function PostBody({ title, coverImage, excerpt, content }: PostBodyProps) {
  return (
    <>
      {coverImage && (
        <div className="relative h-64 sm:h-80 lg:h-96 rounded-xl overflow-hidden mb-8">
          <Image src={coverImage} alt={title} fill className="object-cover" priority />
        </div>
      )}
      {excerpt && <p className="text-lg text-muted-foreground mb-8 border-l-4 border-primary pl-4 italic">{excerpt}</p>}
      <EditorContent content={content} />
    </>
  )
}
