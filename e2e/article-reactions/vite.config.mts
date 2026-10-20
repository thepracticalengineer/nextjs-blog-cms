import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
export default defineConfig({
 define:{'process.env':{}},
 plugins:[react(),{name:'isolated-article-reactions',enforce:'pre',resolveId(source,importer){
  if(importer?.includes('/features/article-reactions/') && ['@/features/comments/reaction-client','./actions','./client'].includes(source)) return fileURLToPath(new URL('./actions.ts',import.meta.url))
 }}],
 resolve:{alias:[{find:'@/features/comments/reaction-client',replacement:fileURLToPath(new URL('./actions.ts',import.meta.url))},{find:'@',replacement:fileURLToPath(new URL('../../',import.meta.url))}]},
})
