import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

export default defineConfig({
  testDir: './seo', workers: 1, timeout: 60_000,
  outputDir: '../test-results/seo', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3110', trace: 'retain-on-failure' },
  webServer: [{
    command: 'node e2e/seo/server.mjs', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:54996', reuseExistingServer: false,
  }, {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3110', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3110', reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-seo-ui', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3110', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54996', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_GENERATIVE_AI_API_KEY: '' },
  }],
})
