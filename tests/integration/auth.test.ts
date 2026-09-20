import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { admins, applications, authTokens } from '@/db/schema'
import { consumeToken, hashToken, issueToken, newToken } from '@/services/auth/tokens'

const db = getDb()

async function anAdmin() {
  const [row] = await db.insert(admins)
    .values({ email: `admin+${Date.now()}${Math.random()}@example.org`, name: 'Test Admin' })
    .returning()
  return row
}

async function anApplication() {
  const [row] = await db.insert(applications).values({
    orgName: 'Debian', contactName: 'A Maintainer',
    contactEmail: `maintainer+${Date.now()}${Math.random()}@example.org`,
    website: 'https://www.debian.org',
    about: 'a'.repeat(120), showcase: 'b'.repeat(120),
    communityImpact: 'c'.repeat(120), staffingPlan: 'd'.repeat(120), signText: 'Debian',
  }).returning()
  return row
}

beforeEach(async () => { await db.delete(authTokens) })
afterAll(async () => { await closeDb() })

describe('newToken', () => {
  it('produces a long URL-safe string', () => expect(newToken()).toMatch(/^[A-Za-z0-9_-]{40,}$/))
  it('never repeats', () => {
    expect(new Set(Array.from({ length: 200 }, () => newToken())).size).toBe(200)
  })
})

describe('issueToken', () => {
  it('stores only the hash, never the raw token', async () => {
    const application = await anApplication()
    const raw = await issueToken(db, { purpose: 'applicant_portal', applicationId: application.id })
    const rows = await db.select().from(authTokens)
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenHash).toBe(hashToken(raw))
    expect(rows[0].tokenHash).not.toBe(raw)
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('consumeToken', () => {
  it('returns the subject and marks the token used', async () => {
    const application = await anApplication()
    const raw = await issueToken(db, { purpose: 'applicant_portal', applicationId: application.id })
    expect((await consumeToken(raw, 'applicant_portal'))?.applicationId).toBe(application.id)
    const [row] = await db.select().from(authTokens)
    expect(row.consumedAt).toBeInstanceOf(Date)
  })

  it('refuses a token a second time', async () => {
    const application = await anApplication()
    const raw = await issueToken(db, { purpose: 'applicant_portal', applicationId: application.id })
    await consumeToken(raw, 'applicant_portal')
    expect(await consumeToken(raw, 'applicant_portal')).toBeNull()
  })

  it('refuses a token issued for a different purpose', async () => {
    const admin = await anAdmin()
    const raw = await issueToken(db, { purpose: 'admin_login', adminId: admin.id })
    expect(await consumeToken(raw, 'applicant_portal')).toBeNull()
  })

  it('refuses an expired token', async () => {
    const admin = await anAdmin()
    const raw = await issueToken(db, { purpose: 'admin_login', adminId: admin.id })
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.tokenHash, hashToken(raw)))
    expect(await consumeToken(raw, 'admin_login')).toBeNull()
  })

  it('refuses a token that was never issued', async () => {
    expect(await consumeToken(newToken(), 'admin_login')).toBeNull()
  })

  it('gives an admin token a much shorter life than an applicant token', async () => {
    const admin = await anAdmin()
    const application = await anApplication()
    await issueToken(db, { purpose: 'admin_login', adminId: admin.id })
    const [adminRow] = await db.select().from(authTokens)
    await db.delete(authTokens)
    await issueToken(db, { purpose: 'applicant_portal', applicationId: application.id })
    const [applicantRow] = await db.select().from(authTokens)
    expect(applicantRow.expiresAt.getTime()).toBeGreaterThan(adminRow.expiresAt.getTime())
  })
})
