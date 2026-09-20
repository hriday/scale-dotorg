import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hit, resetRateLimits } from '@/lib/ratelimit'

beforeEach(() => {
  resetRateLimits()
  vi.useRealTimers()
})

describe('hit', () => {
  it('allows up to the limit', () => {
    expect(hit('ip:1', 3, 60_000)).toBe(true)
    expect(hit('ip:1', 3, 60_000)).toBe(true)
    expect(hit('ip:1', 3, 60_000)).toBe(true)
  })

  it('blocks past the limit', () => {
    for (let i = 0; i < 3; i += 1) hit('ip:2', 3, 60_000)
    expect(hit('ip:2', 3, 60_000)).toBe(false)
  })

  it('keeps separate counters per key', () => {
    for (let i = 0; i < 3; i += 1) hit('ip:3', 3, 60_000)
    expect(hit('ip:4', 3, 60_000)).toBe(true)
  })

  it('lets the window expire', () => {
    vi.useFakeTimers()
    for (let i = 0; i < 3; i += 1) hit('ip:5', 3, 60_000)
    expect(hit('ip:5', 3, 60_000)).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(hit('ip:5', 3, 60_000)).toBe(true)
  })
})
