import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { admins, authTokens, emailOutbox } from '@/db/schema'
import { sendAdminLink } from '@/app/admin/login/actions'

const db = getDb()
beforeEach(async () => { await db.delete(emailOutbox); await db.delete(authTokens) })
afterAll(async () => { await closeDb() })

describe('sendAdminLink', () => {
  it('queues a link for the seeded admin', async () => {
    await sendAdminLink('bala@socallinuxexpo.org')
    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].toEmail).toBe('bala@socallinuxexpo.org')
    expect(outbox[0].bodyText).toContain('/admin/enter?token=')
  })

  it('matches the address case-insensitively', async () => {
    await sendAdminLink('Bala@SoCalLinuxExpo.org')
    expect(await db.select().from(emailOutbox)).toHaveLength(1)
  })

  it('queues nothing for an address that is not an admin', async () => {
    await sendAdminLink('stranger@example.org')
    expect(await db.select().from(emailOutbox)).toHaveLength(0)
    expect(await db.select().from(authTokens)).toHaveLength(0)
  })

  it('queues nothing for a deactivated admin', async () => {
    const email = `retired+${Date.now()}@socallinuxexpo.org`
    await db.insert(admins).values({ email, name: 'Retired', isActive: false })
    await sendAdminLink(email)
    expect(await db.select().from(emailOutbox)).toHaveLength(0)
    await db.delete(admins).where(eq(admins.email, email))
  })
})
