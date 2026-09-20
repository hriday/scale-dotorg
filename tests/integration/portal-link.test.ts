import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '@/db/client'
import { applications, authTokens, emailOutbox } from '@/db/schema'
import { sendPortalLink } from '@/app/portal/actions'

const db = getDb()

beforeEach(async () => {
  await db.delete(emailOutbox)
  await db.delete(authTokens)
  await db.delete(applications)
})
afterAll(async () => { await closeDb() })

async function anApplication(email: string) {
  const [row] = await db.insert(applications).values({
    orgName: 'Debian', contactName: 'A Maintainer', contactEmail: email,
    website: 'https://www.debian.org',
    about: 'a'.repeat(120), showcase: 'b'.repeat(120),
    communityImpact: 'c'.repeat(120), staffingPlan: 'd'.repeat(120), signText: 'Debian',
  }).returning()
  return row
}

describe('sendPortalLink', () => {
  it('queues a link for an address that has an application', async () => {
    await anApplication('maintainer@example.org')
    await sendPortalLink('maintainer@example.org')

    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].toEmail).toBe('maintainer@example.org')
    expect(outbox[0].bodyText).toContain('/portal/enter?token=')
    expect(await db.select().from(authTokens)).toHaveLength(1)
  })

  it('matches the address case-insensitively', async () => {
    await anApplication('maintainer@example.org')
    await sendPortalLink('Maintainer@Example.ORG')
    expect(await db.select().from(emailOutbox)).toHaveLength(1)
  })

  it('queues nothing for an address with no application', async () => {
    await sendPortalLink('nobody@example.org')
    expect(await db.select().from(emailOutbox)).toHaveLength(0)
    expect(await db.select().from(authTokens)).toHaveLength(0)
  })

  it('sends for the most recent application when an org applied twice', async () => {
    await anApplication('maintainer@example.org')
    await new Promise((r) => setTimeout(r, 5))
    const second = await anApplication('maintainer@example.org')
    await sendPortalLink('maintainer@example.org')
    const [token] = await db.select().from(authTokens)
    expect(token.applicationId).toBe(second.id)
  })
})
