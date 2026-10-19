import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

// Actual shared dialog and CSS, with isolated HTTP fixtures; no Auth, database or mail.
export default defineConfig({
  testDir: './image-dialog',
  outputDir: resolve(__dirname, '..', 'test-results/image-dialog'),
  reporter: [['list'], ['html', { outputFolder: resolve(__dirname, '..', 'playwright-report/image-dialog'), open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3110', trace: 'retain-on-failure', reducedMotion: 'reduce' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    cwd: resolve(__dirname, '..'),
    command: 'pnpm exec vite --config e2e/image-dialog/vite.config.mts --host 127.0.0.1 --port 3110 --strictPort',
    url: 'http://127.0.0.1:3110/e2e/image-dialog/fixture.html',
    reuseExistingServer: false,
  },
})
