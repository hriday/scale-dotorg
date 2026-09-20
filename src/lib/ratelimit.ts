interface Window {
  count: number
  expiresAt: number
}

const windows = new Map<string, Window>()

/**
 * In-process fixed-window counter. Counters reset on restart and are not shared
 * across containers; see the spec's rate-limit note for why that is acceptable here.
 */
export function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || existing.expiresAt <= now) {
    windows.set(key, { count: 1, expiresAt: now + windowMs })
    return true
  }

  if (existing.count >= limit) return false

  existing.count += 1
  return true
}

export function resetRateLimits(): void {
  windows.clear()
}
