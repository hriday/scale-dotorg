import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { emailOutbox } from '@/db/schema'
import { BACKOFF_SECONDS, dispatchPending, enqueueEmail } from '@/services/mail/outbox'
import { ConsoleSender } from '@/services/mail/console'
import type { EmailSender } from '@/services/mail/types'

const db = getDb()

const failing: EmailSender = {
  send: async () => {
    throw new Error('provider down')
  },
}

beforeEach(async () => {
  await db.delete(emailOutbox)
  ConsoleSender.sent.length = 0
})

afterAll(async () => {
  await closeDb()
})

const email = {
  to: 'maintainer@example.org',
  subject: 'Hello',
  text: 'body',
  html: '<p>body</p>',
}

describe('enqueueEmail', () => {
  it('writes a pending row', async () => {
    const id = await enqueueEmail(db, email)
    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) })
    expect(row?.status).toBe('pending')
    expect(row?.attempts).toBe(0)
    expect(row?.fromEmail).toBe('dotorgs@socallinuxexpo.org')
  })

  it('leaves no row when the enclosing transaction rolls back', async () => {
    await expect(
      db.transaction(async (tx) => {
        await enqueueEmail(tx, email)
        throw new Error('rolled back')
      }),
    ).rejects.toThrow('rolled back')

    expect(await db.select().from(emailOutbox)).toHaveLength(0)
  })
})

describe('dispatchPending', () => {
  it('sends a pending row and marks it sent', async () => {
    const id = await enqueueEmail(db, email)

    expect(await dispatchPending(20, new ConsoleSender())).toEqual({ sent: 1, failed: 0 })

    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) })
    expect(row?.status).toBe('sent')
    expect(row?.sentAt).toBeInstanceOf(Date)
    expect(ConsoleSender.sent).toHaveLength(1)
  })

  it('records the error and backs off when the sender throws', async () => {
    const id = await enqueueEmail(db, email)

    expect(await dispatchPending(20, failing)).toEqual({ sent: 0, failed: 1 })

    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) })
    expect(row?.status).toBe('pending')
    expect(row?.attempts).toBe(1)
    expect(row?.lastError).toContain('provider down')
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('gives up after the last backoff step', async () => {
    const id = await enqueueEmail(db, email)
    await db.update(emailOutbox).set({ attempts: BACKOFF_SECONDS.length }).where(eq(emailOutbox.id, id))

    await dispatchPending(20, failing)

    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) })
    expect(row?.status).toBe('failed')
  })

  it('does not pick up a row whose backoff has not elapsed', async () => {
    const id = await enqueueEmail(db, email)
    await db
      .update(emailOutbox)
      .set({ nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(eq(emailOutbox.id, id))

    expect(await dispatchPending(20, new ConsoleSender())).toEqual({ sent: 0, failed: 0 })
  })
})
