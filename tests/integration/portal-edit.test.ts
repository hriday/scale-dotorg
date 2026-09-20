import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { applications, uploads } from '@/db/schema'
import { applyEdit } from '@/app/portal/application/actions'
import { prepareUpload } from '@/services/uploads'

const db = getDb()
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])

const valid = {
  orgName: 'Debian', contactName: 'A Maintainer', contactEmail: 'maintainer@example.org',
  website: 'https://www.debian.org', about: 'a'.repeat(120), showcase: 'b'.repeat(120),
  communityImpact: 'c'.repeat(120), staffingPlan: 'd'.repeat(120), signText: 'Debian',
}

beforeEach(async () => { await db.delete(applications) })
afterAll(async () => { await closeDb() })

async function seeded() {
  const [row] = await db.insert(applications).values(valid).returning()
  const prepared = prepareUpload('logo.png', png)
  if (!prepared.ok) throw new Error(prepared.error)
  const [upload] = await db.insert(uploads).values({ ...prepared.value, applicationId: row.id }).returning()
  await db.update(applications).set({ logoUploadId: upload.id }).where(eq(applications.id, row.id))
  return { application: row, uploadId: upload.id }
}

describe('applyEdit', () => {
  it('saves changed answers', async () => {
    const { application } = await seeded()
    await applyEdit(application.id, { ...valid, orgName: 'The Debian Project' }, null)
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.orgName).toBe('The Debian Project')
  })

  it('bumps updatedAt', async () => {
    const { application } = await seeded()
    await new Promise((r) => setTimeout(r, 5))
    await applyEdit(application.id, { ...valid, signText: 'Debian!' }, null)
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after!.updatedAt.getTime()).toBeGreaterThan(application.updatedAt.getTime())
  })

  it('keeps the existing logo when none is uploaded', async () => {
    const { application, uploadId } = await seeded()
    await applyEdit(application.id, valid, null)
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.logoUploadId).toBe(uploadId)
  })

  it('replaces the logo when a new one is uploaded, keeping the old row as history', async () => {
    const { application, uploadId } = await seeded()
    const prepared = prepareUpload('new.jpg', jpeg)
    if (!prepared.ok) throw new Error(prepared.error)
    await applyEdit(application.id, valid, prepared.value)
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.logoUploadId).not.toBe(uploadId)
    expect(await db.select().from(uploads).where(eq(uploads.applicationId, application.id))).toHaveLength(2)
  })

  it('never changes the status', async () => {
    const { application } = await seeded()
    await db.update(applications).set({ status: 'under_review' }).where(eq(applications.id, application.id))
    await applyEdit(application.id, { ...valid, orgName: 'Changed' }, null)
    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('under_review')
  })
})
