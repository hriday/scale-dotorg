import { resetRateLimits } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

/**
 * Clears the in-process rate-limit counters. Development only — in production
 * the limiter is the protection and nothing may reset it over HTTP.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }
  resetRateLimits()
  return Response.json({ reset: true })
}
