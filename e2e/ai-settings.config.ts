import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

export default defineConfig({
  testDir: './ai-settings', workers: 1, timeout: 60_000,
  outputDir: '../test-results/ai-settings', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3111', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: [{
    command: 'node e2e/ai-settings/server.mjs', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:54994/auth/v1/settings', reuseExistingServer: false,
  }, {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3111', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3111/login', reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-ai-settings', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3111', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54994', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: '', LLM_KEY_ENCRYPTION_SECRET: 'disposable-settings-fixture-0001', RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_GENERATIVE_AI_KEY: '' },
  }],
})
