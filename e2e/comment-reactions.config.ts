import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'
export default defineConfig({
 testDir:'./comment-reactions', outputDir:'../test-results/comment-reactions',reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:3112',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
 webServer:{command:'pnpm exec vite --config e2e/comment-reactions/vite.config.mts --host 127.0.0.1 --port 3112 --strictPort',
  cwd:resolve(__dirname,'..'),url:'http://127.0.0.1:3112/e2e/comment-reactions/fixture.html',reuseExistingServer:false},
})
