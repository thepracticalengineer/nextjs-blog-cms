import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'
export default defineConfig({
  testDir: './bulk-posts', outputDir: '../test-results/bulk-posts', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3123', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm exec vite --config e2e/bulk-posts/vite.config.mts --host 127.0.0.1 --port 3123 --strictPort',
    cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3123/e2e/bulk-posts/fixture.html', reuseExistingServer: false,
  },
})
