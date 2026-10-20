import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'
export default defineConfig({
 testDir:'./article-reactions',outputDir:'../test-results/article-reactions',reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:3113',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
 webServer:{command:'pnpm exec vite --config e2e/article-reactions/vite.config.mts --host 127.0.0.1 --port 3113 --strictPort',
  cwd:resolve(__dirname,'..'),url:'http://127.0.0.1:3113/e2e/article-reactions/fixture.html',reuseExistingServer:false},
})
