import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

// Never inherit .env.local credentials; no seeding and no external services.
export default defineConfig({
  testDir: './logout-ui', workers: 1, timeout: 60_000,
  outputDir: '../test-results/logout', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3106', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: [{
    command: 'node e2e/logout-ui/auth-server.mjs', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:54998/auth/v1/settings', reuseExistingServer: false,
  }, {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3106', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3106/login', reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-logout-ui', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3106', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54998', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_GENERATIVE_AI_API_KEY: '' },
  }],
})
