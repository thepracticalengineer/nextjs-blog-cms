export async function createComment(postId: string, content: string, postSlug: string, requestId: string) {
 const response = await fetch('/__comments', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ postId, content, postSlug, requestId }),
 })
 if (!response.ok) throw new Error('Response lost')
 return response.json()
}
