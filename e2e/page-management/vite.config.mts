import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url))
export default defineConfig({ plugins: [react()], resolve: { alias: [
  { find: '@/features/pages/actions', replacement: path('./actions.ts') },
  { find: 'next/navigation', replacement: path('./navigation.ts') },
  { find: 'next/link', replacement: path('./Link.tsx') },
  { find: '@', replacement: path('../../') },
] } })
