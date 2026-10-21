import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const stub = fileURLToPath(new URL('./stubs.tsx', import.meta.url))
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    ...['@/features/posts/actions', '@/features/posts/bulk-actions', 'next/navigation', 'next/link'].map(find => ({ find, replacement: stub })),
    { find: '@', replacement: fileURLToPath(new URL('../../', import.meta.url)) },
  ] },
})
