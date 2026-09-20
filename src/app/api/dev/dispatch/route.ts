import { dispatchPending } from '@/services/mail/outbox'

export const dynamic = 'force-dynamic'

/**
 * Flushes the outbox on demand. Development only — production runs the worker
 * on a timer, and this route must never become a way to trigger sending.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }
  return Response.json(await dispatchPending())
}
