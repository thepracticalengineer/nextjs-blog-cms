import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

export default defineConfig({
  testDir: './auth-abuse-ui', workers: 1, timeout: 60_000,
  outputDir: '../test-results/auth-abuse', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3108', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: [{
    command: 'node e2e/auth-abuse-ui/auth-server.mjs', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:54996/auth/v1/settings', reuseExistingServer: false,
  }, {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3108', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3108/login', reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-auth-abuse-ui', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3108', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54996', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-only', AUTH_ABUSE_HMAC_KEY: 'isolated-ui-test-hmac-at-least-32-characters', AUTH_TRUSTED_IP_HEADER: 'x-forwarded-for', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '', RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_GENERATIVE_AI_KEY: '' },
  }],
})
