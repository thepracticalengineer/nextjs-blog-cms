import { libraryRequest } from '@/features/posts/media/library'
export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, { params }: Context) { return libraryRequest(request, (await params).id) }
export async function PATCH(request: Request, { params }: Context) { return libraryRequest(request, (await params).id) }
