import { libraryRequest } from '@/features/posts/media/library'
export const runtime = 'nodejs'
export const GET = (request: Request) => libraryRequest(request)
