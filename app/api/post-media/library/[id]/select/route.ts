import { libraryRequest } from '@/features/posts/media/library'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return libraryRequest(request, (await params).id, true) }
