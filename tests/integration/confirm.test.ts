import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { applications, auditLog, settings } from '@/db/schema'
import { recordConfirmation } from '@/app/portal/application/actions'

const db = getDb()
beforeEach(async () => { await db.delete(applications) })
afterAll(async () => { await closeDb() })

async function anAcceptedApplication() {
  const [row] = await db.insert(applications).values({
    orgName: 'Debian', contactName: 'A Maintainer',
    contactEmail: `maintainer+${Date.now()}${Math.random()}@example.org`,
    website: 'https://www.debian.org', about: 'a'.repeat(120), showcase: 'b'.repeat(120),
    communityImpact: 'c'.repeat(120), staffingPlan: 'd'.repeat(120), signText: 'Debian',
    status: 'accepted',
  }).returning()
  return row
}

describe('recordConfirmation', () => {
  it('moves the application to confirmed', async () => {
    const application = await anAcceptedApplication()
    await recordConfirmation(application.id, 'A Maintainer')
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('confirmed')
    expect(after?.confirmedAt).toBeInstanceOf(Date)
    expect(after?.confirmedByName).toBe('A Maintainer')
  })

  it('freezes the exact terms text that was agreed to', async () => {
    const application = await anAcceptedApplication()
    const current = await db.query.settings.findFirst({ where: eq(settings.id, 1) })
    await recordConfirmation(application.id, 'A Maintainer')
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.confirmedTermsSnapshot).toBe(current!.termsText)
    expect(after?.confirmedTermsVersion).toBe(current!.termsVersion)
  })

  it('keeps the snapshot even after the terms are later rewritten', async () => {
    const application = await anAcceptedApplication()
    const before = await db.query.settings.findFirst({ where: eq(settings.id, 1) })
    await recordConfirmation(application.id, 'A Maintainer')

    await db.update(settings).set({ termsText: 'Completely different terms.', termsVersion: 99 })
      .where(eq(settings.id, 1))

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.confirmedTermsSnapshot).toBe(before!.termsText)
    expect(after?.confirmedTermsSnapshot).not.toContain('Completely different')

    await db.update(settings).set({ termsText: before!.termsText, termsVersion: before!.termsVersion })
      .where(eq(settings.id, 1))
  })

  it('records the confirmation in the audit log', async () => {
    const application = await anAcceptedApplication()
    await recordConfirmation(application.id, 'A Maintainer')
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.applicationId, application.id))
    expect(entry.action).toBe('booth.confirmed')
    expect(entry.actorType).toBe('applicant')
    expect(entry.detail).toMatchObject({ confirmedByName: 'A Maintainer' })
  })

  it('refuses to confirm an application that was not accepted', async () => {
    const application = await anAcceptedApplication()
    await db.update(applications).set({ status: 'submitted' }).where(eq(applications.id, application.id))
    await expect(recordConfirmation(application.id, 'A Maintainer')).rejects.toThrow(/submitted.*confirmed/)
  })
})
