import { defineConfig, devices } from '@playwright/test'
import { reporting } from './e2e/reporting'
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
  ...reporting(process.env.E2E_PRODUCTION === '1' ? 'publication' : 'main'),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/api/**/*.spec.ts', '**/retirement/**/*.spec.ts'],
    },
    {
      name: 'browser',
      testMatch: '**/browser/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm exec next ${process.env.E2E_PRODUCTION === '1' ? 'start' : 'dev'} --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && process.env.E2E_REUSE_SERVER === '1',
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_GENERATIVE_AI_KEY: '' },
  },
})
