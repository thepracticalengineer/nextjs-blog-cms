import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

// Runtime-only browser harness: no Next server, credentials, database, mail, or live Google calls.
export default defineConfig({
  testDir: './analytics',
  outputDir: '../test-results/analytics',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3106', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    cwd: resolve(__dirname, '..'),
    command: 'pnpm exec vite --host 127.0.0.1 --port 3106 --strictPort',
    url: 'http://127.0.0.1:3106/e2e/analytics/fixture.html',
    reuseExistingServer: false,
  },
})
