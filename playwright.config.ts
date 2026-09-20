import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  testIgnore: ['**/helpers.ts', '**/global-setup.ts'],
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/healthz',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
