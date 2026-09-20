import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { admins, applications, auditLog, emailOutbox, internalNotes, messages } from '@/db/schema'
import { transitionApplication } from '@/domain/application'
import { writeNote } from '@/app/admin/applications/[id]/actions'

const db = getDb()
beforeEach(async () => { await db.delete(emailOutbox) })
afterAll(async () => { await closeDb() })

async function fixture() {
  const [application] = await db.insert(applications).values({
    orgName: 'Debian', contactName: 'A Maintainer',
    contactEmail: `maintainer+${Date.now()}${Math.random()}@example.org`,
    website: 'https://www.debian.org', about: 'a'.repeat(120), showcase: 'b'.repeat(120),
    communityImpact: 'c'.repeat(120), staffingPlan: 'd'.repeat(120), signText: 'Debian',
  }).returning()

  const admin = await db.query.admins.findFirst({ where: eq(admins.email, 'bala@socallinuxexpo.org') })
  if (!admin) throw new Error('Run `npm run db:seed` first.')
  return { application, admin }
}

describe('transitionApplication', () => {
  it('moves the status and records who decided', async () => {
    const { application, admin } = await fixture()
    await transitionApplication({
      applicationId: application.id, to: 'accepted', adminId: admin.id,
      subject: 'You have a booth', body: 'Congratulations.', sendEmail: true,
    })
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('accepted')
    expect(after?.decidedBy).toBe(admin.id)
    expect(after?.decidedAt).toBeInstanceOf(Date)
  })

  it('queues the email and records it in the thread', async () => {
    const { application, admin } = await fixture()
    await transitionApplication({
      applicationId: application.id, to: 'accepted', adminId: admin.id,
      subject: 'You have a booth', body: 'Congratulations.', sendEmail: true,
    })
    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].subject).toBe('You have a booth')
    expect(outbox[0].toEmail).toBe(application.contactEmail)

    const thread = await db.select().from(messages).where(eq(messages.applicationId, application.id))
    expect(thread).toHaveLength(1)
    expect(thread[0].direction).toBe('outbound')
    expect(thread[0].emailOutboxId).toBe(outbox[0].id)
  })

  it('can change status without sending anything', async () => {
    const { application, admin } = await fixture()
    await transitionApplication({
      applicationId: application.id, to: 'under_review', adminId: admin.id, sendEmail: false,
    })
    expect(await db.select().from(emailOutbox)).toHaveLength(0)
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('under_review')
  })

  it('writes an audit row naming both states', async () => {
    const { application, admin } = await fixture()
    await transitionApplication({
      applicationId: application.id, to: 'waitlisted', adminId: admin.id, sendEmail: false,
    })
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.applicationId, application.id))
    expect(entry.action).toBe('status.changed')
    expect(entry.detail).toMatchObject({ from: 'submitted', to: 'waitlisted' })
    expect(entry.actorId).toBe(admin.id)
  })

  it('refuses an illegal transition', async () => {
    const { application, admin } = await fixture()
    await db.update(applications).set({ status: 'rejected' }).where(eq(applications.id, application.id))
    await expect(transitionApplication({
      applicationId: application.id, to: 'accepted', adminId: admin.id, sendEmail: false,
    })).rejects.toThrow(/rejected.*accepted/)
  })

  it('leaves the status untouched when the email cannot be queued', async () => {
    const { application, admin } = await fixture()
    await expect(transitionApplication({
      applicationId: application.id, to: 'accepted', adminId: admin.id,
      subject: '', body: '', sendEmail: true,
    })).rejects.toThrow()
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('submitted')
    expect(await db.select().from(emailOutbox)).toHaveLength(0)
  })
})

describe('writeNote', () => {
  it('stores the note against the application and its author', async () => {
    const { application, admin } = await fixture()
    await writeNote(application.id, admin.id, 'Strong application, good demo plan.')
    const notes = await db.select().from(internalNotes).where(eq(internalNotes.applicationId, application.id))
    expect(notes).toHaveLength(1)
    expect(notes[0].adminId).toBe(admin.id)
  })

  it('never lands in the applicant-visible message thread', async () => {
    const { application, admin } = await fixture()
    await writeNote(application.id, admin.id, 'Internal only: they were late last year.')
    const thread = await db.select().from(messages).where(eq(messages.applicationId, application.id))
    expect(thread).toHaveLength(0)
  })
})
