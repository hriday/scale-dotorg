/** Next calls this once per server process on boot. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Opt out in tests, which flush the outbox explicitly and assert on it.
  if (process.env.MAIL_WORKER === 'off') return

  const { startMailWorker } = await import('./services/mail/worker')
  startMailWorker()
}
