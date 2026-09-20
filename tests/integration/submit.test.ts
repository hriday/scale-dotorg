import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { applications, authTokens, emailOutbox, emailTemplates, uploads } from '@/db/schema'
import { createApplication } from '@/services/applications'
import { prepareUpload } from '@/services/uploads'

const db = getDb()

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

const input = {
  orgName: 'Debian',
  contactName: 'A Maintainer',
  contactEmail: 'maintainer@example.org',
  website: 'https://www.debian.org',
  about: 'a'.repeat(120),
  showcase: 'b'.repeat(120),
  communityImpact: 'c'.repeat(120),
  staffingPlan: 'd'.repeat(120),
  signText: 'Debian Project',
}

beforeEach(async () => {
  await db.delete(emailOutbox)
  await db.delete(applications)
})

afterAll(async () => {
  await closeDb()
})

function logo() {
  const result = prepareUpload('logo.png', png)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('createApplication', () => {
  it('stores the application, the logo, a token, and a receipt email', async () => {
    const { id, token } = await createApplication(input, logo())

    const app = await db.query.applications.findFirst({ where: eq(applications.id, id) })
    expect(app?.status).toBe('submitted')
    expect(app?.logoUploadId).not.toBeNull()

    const upload = await db.query.uploads.findFirst({ where: eq(uploads.applicationId, id) })
    expect(upload?.contentType).toBe('image/png')

    const tokens = await db.select().from(authTokens).where(eq(authTokens.applicationId, id))
    expect(tokens).toHaveLength(1)
    expect(tokens[0].purpose).toBe('applicant_portal')
    expect(tokens[0].tokenHash).not.toBe(token)
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)

    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].toEmail).toBe('maintainer@example.org')
    expect(outbox[0].bodyText).toContain(token)
    expect(outbox[0].status).toBe('pending')
  })

  it('writes nothing at all when a later step in the transaction fails', async () => {
    // The template lookup happens after the application and upload are inserted,
    // so removing it forces a failure partway through the transaction.
    const [saved] = await db
      .delete(emailTemplates)
      .where(eq(emailTemplates.key, 'submission_receipt'))
      .returning()

    try {
      await expect(createApplication(input, logo())).rejects.toThrow(/submission_receipt/)
      expect(await db.select().from(applications)).toHaveLength(0)
      expect(await db.select().from(uploads)).toHaveLength(0)
      expect(await db.select().from(emailOutbox)).toHaveLength(0)
    } finally {
      await db.insert(emailTemplates).values(saved)
    }
  })
})
