import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

// Synthetic loopback Auth only: no real accounts, database, mail or webhooks.
export default defineConfig({
  testDir: './mfa-ui', workers: 1, timeout: 60_000,
  outputDir: '../test-results/mfa', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3107', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: [{
    command: 'node e2e/mfa-ui/auth-server.mjs', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:54997/auth/v1/settings', reuseExistingServer: false,
  }, {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3107', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3107/login', reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-mfa-ui', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3107', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54997', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_GENERATIVE_AI_API_KEY: '' },
  }],
})
