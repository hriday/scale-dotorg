'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { applications, auditLog, emailTemplates, internalNotes, messages } from '@/db/schema'
import { DECISION_TEMPLATE_KEYS, transitionApplication, type Status } from '@/domain/application'
import { formatFee } from '@/domain/settings'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { loadSettings } from '@/lib/settings'
import { requireAdmin } from '@/services/auth/session'
import { renderTemplate } from '@/services/mail/render'

export interface NoteState {
  error?: string
  saved?: boolean
}

export interface DecisionState {
  error?: string
  done?: boolean
}

export async function writeNote(
  applicationId: string,
  adminId: string,
  body: string,
): Promise<void> {
  await getDb().insert(internalNotes).values({ applicationId, adminId, body })
}

export async function addNote(
  applicationId: string,
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const admin = await requireAdmin()
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { error: 'Write something first.' }

  await writeNote(applicationId, admin.id, body)
  revalidatePath(`/admin/applications/${applicationId}`)
  return { saved: true }
}

export async function assignBoothNumber(applicationId: string, formData: FormData): Promise<void> {
  const admin = await requireAdmin()
  const raw = String(formData.get('boothNumber') ?? '').trim()
  const boothNumber = raw === '' ? null : raw.slice(0, 20)

  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ boothNumber, updatedAt: new Date() })
      .where(eq(applications.id, applicationId))

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: admin.id,
      applicationId,
      action: 'booth.assigned',
      detail: { boothNumber },
    })
  })

  revalidatePath(`/admin/applications/${applicationId}`)
}

/** Marks inbound messages read, so the dashboard's unanswered count is honest. */
export async function markThreadRead(applicationId: string): Promise<void> {
  await getDb()
    .update(messages)
    .set({ readByAdminAt: new Date() })
    .where(eq(messages.applicationId, applicationId))
}

/** The pre-filled email for a decision, or null when that move sends nothing. */
export async function defaultDecisionEmail(
  applicationId: string,
  to: Status,
): Promise<{ subject: string; body: string } | null> {
  const key = DECISION_TEMPLATE_KEYS[to]
  if (!key) return null

  const db = getDb()
  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
  })
  if (!application) return null

  const template = await db.query.emailTemplates.findFirst({ where: eq(emailTemplates.key, key) })
  if (!template) return null

  const settings = await loadSettings()
  const rendered = renderTemplate(template, {
    contact_name: application.contactName,
    org_name: application.orgName,
    event: EVENT.name,
    contact_email: EVENT.contactEmail,
    fee: formatFee(settings.lateCancellationFeeCents),
    portal_url: `${getEnv().PUBLIC_BASE_URL}/portal`,
  })

  return { subject: rendered.subject, body: rendered.text }
}

export async function decide(
  applicationId: string,
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const admin = await requireAdmin()
  const to = String(formData.get('status') ?? '') as Status
  const sendEmail = formData.get('sendEmail') === 'on'

  try {
    await transitionApplication({
      applicationId,
      to,
      adminId: admin.id,
      subject: String(formData.get('subject') ?? ''),
      body: String(formData.get('body') ?? ''),
      sendEmail,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That change was refused.' }
  }

  revalidatePath(`/admin/applications/${applicationId}`)
  return { done: true }
}
