import { dispatchPending } from './outbox'

const INTERVAL_MS = 15_000

const store = globalThis as unknown as { __boothMailWorker?: NodeJS.Timeout }

/**
 * Polls the outbox on a timer inside the app process. Started once from
 * instrumentation. Kept in a global so a module instantiated twice cannot
 * start two workers; SKIP LOCKED would make that safe anyway, but one is tidier.
 */
export function startMailWorker(): void {
  if (store.__boothMailWorker) return

  store.__boothMailWorker = setInterval(() => {
    dispatchPending().catch((error) => {
      console.error('[mail worker] dispatch failed', error)
    })
  }, INTERVAL_MS)

  // Never hold the process open on its own account.
  store.__boothMailWorker.unref?.()
  console.log(`[mail worker] polling every ${INTERVAL_MS / 1000}s`)
}
