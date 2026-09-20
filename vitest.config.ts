import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Load every var from .env, not just VITE_-prefixed ones.
    env: { ...loadEnv('', process.cwd(), ''), MAIL_WORKER: 'off' },
    // Integration files share one Postgres and truncate tables between tests,
    // so running files in parallel makes them stomp each other.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
