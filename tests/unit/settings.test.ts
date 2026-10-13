import { describe, expect, it } from 'vitest'
import { DEFAULT_TERMS_TEXT, formatFee, windowState } from '@/domain/settings'

const window = {
  applicationsOpenAt: new Date('2026-10-01T00:00:00Z'),
  applicationsCloseAt: new Date('2027-01-15T23:59:59Z'),
}

describe('windowState', () => {
  it('is before the window opens', () => {
    expect(windowState(window, new Date('2026-09-30T23:59:59Z'))).toBe('before')
  })

  it('is open at the opening instant', () => {
    expect(windowState(window, new Date('2026-10-01T00:00:00Z'))).toBe('open')
  })

  it('is open inside the window', () => {
    expect(windowState(window, new Date('2026-12-01T00:00:00Z'))).toBe('open')
  })

  it('is closed after the window', () => {
    expect(windowState(window, new Date('2027-01-16T00:00:01Z'))).toBe('closed')
  })
})

describe('formatFee', () => {
  it('renders whole dollars without cents', () => {
    expect(formatFee(100000)).toBe('$1,000')
  })

  it('renders partial dollars with cents', () => {
    expect(formatFee(99950)).toBe('$999.50')
  })
})

describe('DEFAULT_TERMS_TEXT', () => {
  it('names the contact address', () => {
    expect(DEFAULT_TERMS_TEXT).toContain('dotorgs@socallinuxexpo.org')
  })

  it('describes the deposit without naming an amount', () => {
    expect(DEFAULT_TERMS_TEXT).toContain('one-time deposit')
    expect(DEFAULT_TERMS_TEXT).not.toMatch(/\$\d/)
  })
})
