import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications, auditLog, messages } from '@/db/schema'
import { enqueueEmail } from '@/services/mail/outbox'
import { assertTransition, type Status } from './status'

// Re-exported so server-side callers have one import for both halves.
export * from './status'

export interface TransitionInput {
  applicationId: string
  to: Status
  adminId: string
  subject?: string
  body?: string
  sendEmail: boolean
}

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

/**
 * The single place an application's status changes. Status, audit row, thread
 * entry and queued email all commit together, so an applicant can never be
 * accepted without the email that tells them so.
 */
export async function transitionApplication(input: TransitionInput): Promise<void> {
  const db = getDb()

  await db.transaction(async (tx) => {
    const application = await tx.query.applications.findFirst({
      where: eq(applications.id, input.applicationId),
    })
    if (!application) throw new Error('No such application.')

    const from = application.status as Status
    assertTransition(from, input.to)

    await tx
      .update(applications)
      .set({
        status: input.to,
        decidedAt: new Date(),
        decidedBy: input.adminId,
        updatedAt: new Date(),
        ...(input.to === 'withdrawn' ? { withdrawnAt: new Date() } : {}),
      })
      .where(eq(applications.id, input.applicationId))

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      applicationId: input.applicationId,
      action: 'status.changed',
      detail: { from, to: input.to, emailed: input.sendEmail },
    })

    if (!input.sendEmail) return

    const subject = input.subject?.trim()
    const body = input.body?.trim()
    if (!subject || !body) {
      throw new Error('An email needs both a subject and a body.')
    }

    const [message] = await tx
      .insert(messages)
      .values({
        applicationId: input.applicationId,
        direction: 'outbound',
        authorAdminId: input.adminId,
        subject,
        body,
      })
      .returning({ id: messages.id })

    const outboxId = await enqueueEmail(tx, {
      to: application.contactEmail,
      subject,
      text: body,
      html: bodyToHtml(body),
      messageId: message.id,
    })

    await tx.update(messages).set({ emailOutboxId: outboxId }).where(eq(messages.id, message.id))
  })
}
