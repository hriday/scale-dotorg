interface Window {
  count: number
  expiresAt: number
}

/**
 * One shared map for the whole process. Next can instantiate a module more than
 * once across route bundles, and a per-instance map would silently count each
 * bundle separately — giving a caller several times the intended allowance.
 */
const globalStore = globalThis as unknown as { __boothRateLimits?: Map<string, Window> }
const windows: Map<string, Window> = (globalStore.__boothRateLimits ??= new Map())

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
