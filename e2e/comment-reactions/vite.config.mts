import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
 plugins: [react(), { name:'isolated-reaction-actions', enforce:'pre', resolveId(source, importer) {
  if ((source === '../reaction-actions' || source === '../reaction-client') && importer?.includes('/features/comments/components/')) {
   return fileURLToPath(new URL('./actions.ts',import.meta.url))
  }
 } }],
 resolve: { alias: { '@':fileURLToPath(new URL('../../',import.meta.url)) } },
})
