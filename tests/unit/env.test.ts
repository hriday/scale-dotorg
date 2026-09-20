import { describe, expect, it } from 'vitest'
import { parseEnv } from '@/env'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  SESSION_SECRET: 'x'.repeat(32),
  PUBLIC_BASE_URL: 'http://localhost:3000',
  MAIL_FROM: 'dotorgs@socallinuxexpo.org',
  EMAIL_SENDER: 'console',
}

describe('parseEnv', () => {
  it('accepts a valid console configuration', () => {
    const env = parseEnv(base)
    expect(env.EMAIL_SENDER).toBe('console')
    expect(env.MAIL_FROM).toBe('dotorgs@socallinuxexpo.org')
  })

  it('rejects a session secret shorter than 32 characters', () => {
    expect(() => parseEnv({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/)
  })

  it('refuses to boot with EMAIL_SENDER=smtp2go and no API key', () => {
    expect(() => parseEnv({ ...base, EMAIL_SENDER: 'smtp2go' })).toThrow(/SMTP2GO_API_KEY/)
  })

  it('refuses to boot with EMAIL_SENDER=smtp and no host', () => {
    expect(() => parseEnv({ ...base, EMAIL_SENDER: 'smtp' })).toThrow(/SMTP_HOST/)
  })

  it('coerces SMTP_PORT to a number', () => {
    const env = parseEnv({ ...base, EMAIL_SENDER: 'smtp', SMTP_HOST: 'mailpit', SMTP_PORT: '1025' })
    expect(env.SMTP_PORT).toBe(1025)
  })
})
