import { describe, expect, it } from 'vitest'
import { normalizeEmail } from '@/lib/email'

describe('normalizeEmail', () => {
  it('lowercases', () => {
    expect(normalizeEmail('Bala@SoCalLinuxExpo.org')).toBe('bala@socallinuxexpo.org')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  bala@socallinuxexpo.org \n')).toBe('bala@socallinuxexpo.org')
  })
})
