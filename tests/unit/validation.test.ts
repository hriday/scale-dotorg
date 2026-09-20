import { describe, expect, it } from 'vitest'
import { LIMITS, applicationInputSchema } from '@/validation/application'

const valid = {
  orgName: 'Debian',
  contactName: 'A Maintainer',
  contactEmail: 'Maintainer@Example.ORG',
  website: 'https://www.debian.org',
  about: 'a'.repeat(120),
  showcase: 'b'.repeat(120),
  communityImpact: 'c'.repeat(120),
  staffingPlan: 'd'.repeat(120),
  signText: 'Debian Project',
}

describe('applicationInputSchema', () => {
  it('accepts a complete application', () => {
    expect(applicationInputSchema.parse(valid).orgName).toBe('Debian')
  })

  it('normalizes the contact email', () => {
    expect(applicationInputSchema.parse(valid).contactEmail).toBe('maintainer@example.org')
  })

  it('rejects a long-form answer under the minimum', () => {
    expect(applicationInputSchema.safeParse({ ...valid, about: 'too short' }).success).toBe(false)
  })

  it('rejects a long-form answer over the maximum', () => {
    const long = { ...valid, about: 'a'.repeat(LIMITS.longTextMax + 1) }
    expect(applicationInputSchema.safeParse(long).success).toBe(false)
  })

  it('rejects sign text over 60 characters', () => {
    expect(applicationInputSchema.safeParse({ ...valid, signText: 'x'.repeat(61) }).success).toBe(false)
  })

  it('rejects a non-http website scheme', () => {
    expect(applicationInputSchema.safeParse({ ...valid, website: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('accepts a bare domain and adds https', () => {
    expect(applicationInputSchema.parse({ ...valid, website: 'debian.org' }).website)
      .toBe('https://debian.org')
  })

  it('trims whitespace from short fields', () => {
    expect(applicationInputSchema.parse({ ...valid, orgName: '  Debian  ' }).orgName).toBe('Debian')
  })
})
