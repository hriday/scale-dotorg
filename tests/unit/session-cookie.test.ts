import { describe, expect, it } from 'vitest'
import { cookieIsSecure } from '@/services/auth/cookie'

describe('cookieIsSecure', () => {
  it('is secure when the site is served over https', () => {
    expect(cookieIsSecure('https://booths.socallinuxexpo.org')).toBe(true)
  })

  it('is not secure over plain http, or the browser would never send it back', () => {
    expect(cookieIsSecure('http://206.189.233.225:3000')).toBe(false)
    expect(cookieIsSecure('http://localhost:3000')).toBe(false)
  })

  it('ignores case in the scheme', () => {
    expect(cookieIsSecure('HTTPS://example.org')).toBe(true)
  })

  it('treats an unparseable value as insecure rather than locking everyone out', () => {
    expect(cookieIsSecure('')).toBe(false)
    expect(cookieIsSecure('not a url')).toBe(false)
  })
})
