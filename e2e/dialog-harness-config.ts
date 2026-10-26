import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

/** Real dialog components and CSS, without Auth, database or external services. */
export function dialogHarnessConfig(name: string, port: number) {
  const baseURL = `http://127.0.0.1:${port}`
  return defineConfig({
    testDir: `./${name}`,
    outputDir: resolve(__dirname, '..', `test-results/${name}`),
    reporter: [['list'], ['html', { outputFolder: resolve(__dirname, '..', `playwright-report/${name}`), open: 'never' }]],
    use: { baseURL, trace: 'retain-on-failure', reducedMotion: 'reduce' },
    projects: [
      { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
      { name: 'mobile', use: { ...devices['Pixel 7'] } },
    ],
    webServer: {
      cwd: resolve(__dirname, '..'),
      command: `pnpm exec vite --config e2e/dialog-harness.vite.config.mts --host 127.0.0.1 --port ${port} --strictPort`,
      url: `${baseURL}/e2e/${name}/fixture.html`,
      reuseExistingServer: false,
    },
  })
}
