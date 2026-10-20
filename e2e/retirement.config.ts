import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

// Standalone retirement contract: deliberately no Supabase, provider or mail setup.
export default defineConfig({
  testDir: './retirement', workers: 1, timeout: 60_000,
  outputDir: '../test-results/retirement', reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3110' },
  webServer: {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3110',
    cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3110/login', reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-retirement', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'unavailable', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', SLACK_WEBHOOK_URL: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GOOGLE_GENERATIVE_AI_KEY: '', LLM_KEY_ENCRYPTION_SECRET: '' },
  },
})
