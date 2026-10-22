import { defineConfig } from '@playwright/test'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { assertDedicatedTestProject } from './environment'
config({ path: '.env.e2e' })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!url) throw new Error('Set disposable E2E Supabase credentials first.')
assertDedicatedTestProject(url, process.env.E2E_SUPABASE_PROJECT_REF)
export default defineConfig({
  testDir: './onboarding', workers: 1, timeout: 90_000, expect: { timeout: 15_000 },
  outputDir: '../test-results/onboarding', reporter: [['list']],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }, { name: 'mobile', use: { viewport: { width: 320, height: 800 } } }],
  webServer: {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3000', cwd: resolve(__dirname, '..'),
    url: 'http://localhost:3000', timeout: 120_000, reuseExistingServer: false,
    env: { NEXT_DIST_DIR: '.next-onboarding', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
      AUTH_ABUSE_HMAC_KEY: 'onboarding-disposable-test-key-at-least-32-characters', AUTH_TRUSTED_IP_HEADER: 'x-forwarded-for',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '',
    },
  },
})
