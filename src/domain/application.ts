import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applicationStatus, applications, auditLog, messages } from '@/db/schema'
import { enqueueEmail } from '@/services/mail/outbox'

export type Status = (typeof applicationStatus.enumValues)[number]

/** The states an application can still be moved freely between. */
export const OPEN_STATUSES = ['submitted', 'under_review', 'info_requested', 'waitlisted'] as const

export const TERMINAL_STATUSES = ['rejected', 'withdrawn'] as const

const openTargets = (self: Status): Status[] => OPEN_STATUSES.filter((s) => s !== self) as Status[]

export const TRANSITIONS: Record<Status, readonly Status[]> = {
  submitted: [...openTargets('submitted'), 'accepted', 'rejected', 'withdrawn'],
  under_review: [...openTargets('under_review'), 'accepted', 'rejected', 'withdrawn'],
  info_requested: [...openTargets('info_requested'), 'accepted', 'rejected', 'withdrawn'],
  waitlisted: [...openTargets('waitlisted'), 'accepted', 'rejected', 'withdrawn'],
  accepted: ['confirmed', 'rejected', 'withdrawn'],
  confirmed: ['withdrawn'],
  rejected: [],
  withdrawn: [],
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: Status, to: Status): void {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot move an application from ${from} to ${to}.`)
  }
}

/** Applicants may only edit while no decision has been made. */
export function isEditable(status: Status): boolean {
  return status === 'submitted' || status === 'under_review' || status === 'info_requested'
}

export const STATUS_LABELS: Record<Status, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  info_requested: 'More information needed',
  waitlisted: 'Waitlisted',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
}

/** Decisions that have a default email. Everything else is an internal move. */
export const DECISION_TEMPLATE_KEYS: Partial<Record<Status, string>> = {
  accepted: 'accepted',
  rejected: 'rejected',
  waitlisted: 'waitlisted',
  info_requested: 'info_request',
}

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
