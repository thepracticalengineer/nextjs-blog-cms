import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import { assertDedicatedTestProject } from './e2e/environment'

dotenv.config({ path: '.env.e2e' })
if (process.env.NEXT_PUBLIC_SUPABASE_URL) assertDedicatedTestProject(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.E2E_SUPABASE_PROJECT_REF)

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const port = new URL(baseURL).port || '3000'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: '**/api/**/*.spec.ts',
    },
    {
      name: 'browser',
      testMatch: '**/browser/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && process.env.E2E_REUSE_SERVER === '1',
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
