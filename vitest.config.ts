import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Load every var from .env, not just VITE_-prefixed ones.
    env: loadEnv('', process.cwd(), ''),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
