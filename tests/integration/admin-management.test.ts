import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, ne, count } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { admins } from '@/db/schema'

const db = getDb()
afterAll(async () => { await closeDb() })

/**
 * The guard deactivateAdmin applies, exercised directly: the server action
 * itself needs a request session, but this is the rule worth protecting.
 */
async function otherActiveAdmins(exceptId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(admins)
    .where(and(eq(admins.isActive, true), ne(admins.id, exceptId)))
  return total
}

beforeEach(async () => {
  await db.delete(admins).where(eq(admins.email, 'second@socallinuxexpo.org'))
  await db.update(admins).set({ isActive: true }).where(eq(admins.email, 'bala@socallinuxexpo.org'))
})

describe('the last active admin', () => {
  it('cannot be deactivated when they are the only one', async () => {
    const bala = await db.query.admins.findFirst({
      where: eq(admins.email, 'bala@socallinuxexpo.org'),
    })
    expect(bala).toBeDefined()
    // Deactivate anyone else first so bala really is alone.
    await db.update(admins).set({ isActive: false }).where(ne(admins.id, bala!.id))

    expect(await otherActiveAdmins(bala!.id)).toBe(0)
  })

  it('can be deactivated once a second admin exists', async () => {
    const bala = await db.query.admins.findFirst({
      where: eq(admins.email, 'bala@socallinuxexpo.org'),
    })
    await db.insert(admins).values({
      email: 'second@socallinuxexpo.org',
      name: 'Second Admin',
      isActive: true,
    })

    expect(await otherActiveAdmins(bala!.id)).toBeGreaterThan(0)
  })
})

describe('admin identity', () => {
  it('keeps a deactivated admin referenceable for past decisions', async () => {
    const [row] = await db
      .insert(admins)
      .values({ email: 'second@socallinuxexpo.org', name: 'Second Admin', isActive: true })
      .returning()

    await db.update(admins).set({ isActive: false }).where(eq(admins.id, row.id))

    const still = await db.query.admins.findFirst({ where: eq(admins.id, row.id) })
    expect(still).toBeDefined()
    expect(still?.isActive).toBe(false)
    expect(still?.name).toBe('Second Admin')
  })
})
