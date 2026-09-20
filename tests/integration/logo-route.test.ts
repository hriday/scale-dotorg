import { afterAll, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '@/db/client'
import { applications, uploads } from '@/db/schema'
import { canSeeUpload } from '@/app/logo/[id]/route'

const db = getDb()
afterAll(async () => { await closeDb() })

async function anApplicationWithLogo() {
  const [application] = await db.insert(applications).values({
    orgName: 'Debian', contactName: 'A Maintainer',
    contactEmail: `maintainer+${Date.now()}${Math.random()}@example.org`,
    website: 'https://www.debian.org',
    about: 'a'.repeat(120), showcase: 'b'.repeat(120),
    communityImpact: 'c'.repeat(120), staffingPlan: 'd'.repeat(120), signText: 'Debian',
  }).returning()

  const [upload] = await db.insert(uploads).values({
    applicationId: application.id, filename: 'logo.png', contentType: 'image/png',
    byteSize: 4, sha256: 'abc', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  }).returning()

  return { application, upload }
}

describe('canSeeUpload', () => {
  it('lets any admin see any logo', async () => {
    const { upload } = await anApplicationWithLogo()
    expect(await canSeeUpload(upload.id, { adminId: 'any-admin-id' })).toBe(true)
  })

  it('lets an applicant see their own logo', async () => {
    const { application, upload } = await anApplicationWithLogo()
    expect(await canSeeUpload(upload.id, { applicationId: application.id })).toBe(true)
  })

  it('refuses an applicant another organization’s logo', async () => {
    const mine = await anApplicationWithLogo()
    const theirs = await anApplicationWithLogo()
    expect(await canSeeUpload(theirs.upload.id, { applicationId: mine.application.id })).toBe(false)
  })

  it('refuses an anonymous viewer', async () => {
    const { upload } = await anApplicationWithLogo()
    expect(await canSeeUpload(upload.id, {})).toBe(false)
  })

  it('refuses an unknown upload id', async () => {
    expect(await canSeeUpload('00000000-0000-0000-0000-000000000000', { adminId: 'any' })).toBe(false)
  })
})
