import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'
export default defineConfig({
  testDir: './posts-navigation', outputDir: '../test-results/posts-navigation', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3137', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm exec vite --config e2e/posts-navigation/vite.config.mts --host 127.0.0.1 --port 3137 --strictPort',
    cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3137/e2e/posts-navigation/fixture.html', reuseExistingServer: false,
  },
})
