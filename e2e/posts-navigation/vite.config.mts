import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const stub = fileURLToPath(new URL('./stubs.tsx', import.meta.url))
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    ...['next/navigation', 'next/link', 'next/image', '@/components/auth/use-signout'].map(find => ({ find, replacement: stub })),
    { find: '@', replacement: fileURLToPath(new URL('../../', import.meta.url)) },
  ] },
})
