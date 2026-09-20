import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { getDb } from '@/db/client'
import { emailOutbox } from '@/db/schema'
import { getEnv } from '@/env'
import { getSender } from './sender'
import type { EmailSender } from './types'

/** Delay before each retry. Length also sets the attempt ceiling. */
export const BACKOFF_SECONDS = [60, 300, 900, 3600] as const

export interface EnqueueInput {
  to: string
  subject: string
  text: string
  html: string
  messageId?: string
}

/**
 * Writes the email as a pending row using the caller's transaction, so the mail
 * and the change that caused it commit or roll back together.
 */
export async function enqueueEmail(tx: Db, input: EnqueueInput): Promise<string> {
  const env = getEnv()
  const [row] = await tx
    .insert(emailOutbox)
    .values({
      toEmail: input.to,
      fromEmail: env.MAIL_FROM,
      replyTo: env.MAIL_FROM,
      subject: input.subject,
      bodyText: input.text,
      bodyHtml: input.html,
      messageId: input.messageId ?? null,
    })
    .returning({ id: emailOutbox.id })
  return row.id
}

export async function dispatchPending(
  limit = 20,
  sender: EmailSender = getSender(),
): Promise<{ sent: number; failed: number }> {
  const db = getDb()
  let sent = 0
  let failed = 0

  for (let i = 0; i < limit; i += 1) {
    // Claim one row at a time with SKIP LOCKED so two workers never send twice.
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id FROM email_outbox
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `)
      const id = (rows as unknown as Array<{ id: string }>)[0]?.id
      if (!id) return null
      await tx.update(emailOutbox).set({ status: 'sending' }).where(eq(emailOutbox.id, id))
      return id
    })

    if (!claimed) break

    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, claimed) })
    if (!row) continue

    try {
      const result = await sender.send({
        to: row.toEmail,
        from: row.fromEmail,
        replyTo: row.replyTo ?? undefined,
        subject: row.subject,
        text: row.bodyText,
        html: row.bodyHtml,
      })
      await db
        .update(emailOutbox)
        .set({
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: result.providerMessageId ?? null,
          lastError: null,
        })
        .where(eq(emailOutbox.id, row.id))
      sent += 1
    } catch (error) {
      const attempts = row.attempts + 1
      const exhausted = attempts > BACKOFF_SECONDS.length
      const delay = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]
      await db
        .update(emailOutbox)
        .set({
          status: exhausted ? 'failed' : 'pending',
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt: new Date(Date.now() + delay * 1000),
        })
        .where(eq(emailOutbox.id, row.id))
      failed += 1
    }
  }

  return { sent, failed }
}
