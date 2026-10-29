import { dialogHarnessConfig } from './dialog-harness-config'
const config = dialogHarnessConfig('page-management', 3126)
const managementConfig = { ...config, webServer: { ...config.webServer, command: 'pnpm exec vite --config e2e/page-management/vite.config.mts --host 127.0.0.1 --port 3126 --strictPort' } }

export default managementConfig
