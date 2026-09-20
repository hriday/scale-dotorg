import { execFileSync } from 'node:child_process'

/**
 * Re-seed before the browser suite. The integration tests truncate the
 * applications table, so the demo fixtures these specs rely on must be put
 * back regardless of what ran first.
 */
export default async function globalSetup() {
  execFileSync('npm', ['run', 'db:seed'], { stdio: 'inherit' })
  // The limiter is in-process and survives across runs; clear it so repeated
  // suites do not exhaust a quota meant for real traffic.
  await fetch('http://localhost:3000/api/dev/reset-limits', { method: 'POST' }).catch(() => {})
}
