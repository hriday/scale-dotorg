import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, closeDb } from '@/db/client'
import { applications, settings, uploads } from '@/db/schema'

const db = getDb()

afterAll(async () => {
  await closeDb()
})

const baseApp = {
  contactName: 'A Maintainer',
  about: 'a'.repeat(120),
  showcase: 'b'.repeat(120),
  communityImpact: 'c'.repeat(120),
  staffingPlan: 'd'.repeat(120),
}

describe('schema', () => {
  it('stores an application and reads it back', async () => {
    const [row] = await db
      .insert(applications)
      .values({
        ...baseApp,
        orgName: 'Debian',
        contactEmail: 'maintainer@example.org',
        website: 'https://www.debian.org',
        signText: 'Debian',
      })
      .returning()

    expect(row.status).toBe('submitted')
    expect(row.submittedAt).toBeInstanceOf(Date)

    const found = await db.query.applications.findFirst({ where: eq(applications.id, row.id) })
    expect(found?.orgName).toBe('Debian')

    await db.delete(applications).where(eq(applications.id, row.id))
  })

  it('stores binary logo data', async () => {
    const [app] = await db
      .insert(applications)
      .values({
        ...baseApp,
        orgName: 'EFF',
        contactEmail: 'someone@example.org',
        website: 'https://www.eff.org',
        signText: 'EFF',
      })
      .returning()

    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const [upload] = await db
      .insert(uploads)
      .values({
        applicationId: app.id,
        filename: 'logo.png',
        contentType: 'image/png',
        byteSize: bytes.length,
        sha256: 'deadbeef',
        data: bytes,
      })
      .returning()

    expect(Buffer.from(upload.data)).toEqual(bytes)

    await db.delete(applications).where(eq(applications.id, app.id))
  })

  it('rejects a settings row with an id other than 1', async () => {
    const attempt = db.insert(settings).values({
      id: 2,
      applicationsOpenAt: new Date('2026-10-01T00:00:00Z'),
      applicationsCloseAt: new Date('2027-01-15T23:59:59Z'),
      termsText: 'terms',
    })

    // Drizzle wraps the driver error, so the constraint name lands on the cause.
    const error = await attempt.then(
      () => null,
      (caught: unknown) => caught as Error & { cause?: { constraint_name?: string } },
    )

    expect(error).not.toBeNull()
    expect(error!.cause?.constraint_name).toBe('settings_singleton')
  })
})
