'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import {
  admins,
  applications,
  auditLog,
  emailTemplates,
  messages,
  settings,
  uploads,
} from '@/db/schema'
import { assertTransition, isEditable, type Status } from '@/domain/application'
import { windowState } from '@/domain/settings'
import { getEnv } from '@/env'
import { loadSettings } from '@/lib/settings'
import { destroyApplicantSession, requireApplicant } from '@/services/auth/session'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'
import { prepareUpload, type PreparedUpload } from '@/services/uploads'
import { applicationInputSchema, type ApplicationInput } from '@/validation/application'

export interface EditState {
  errors: Record<string, string>
  message?: string
  saved?: boolean
}

export interface ConfirmState {
  error?: string
  confirmed?: boolean
}

export interface ReplyState {
  error?: string
  sent?: boolean
}

export async function applyEdit(
  applicationId: string,
  input: ApplicationInput,
  logo: PreparedUpload | null,
): Promise<void> {
  const db = getDb()

  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(applications.id, applicationId))

    if (logo) {
      const [upload] = await tx
        .insert(uploads)
        .values({ ...logo, applicationId })
        .returning({ id: uploads.id })
      // The previous upload row stays as cheap history.
      await tx
        .update(applications)
        .set({ logoUploadId: upload.id })
        .where(eq(applications.id, applicationId))
    }

    await tx.insert(auditLog).values({
      actorType: 'applicant',
      actorId: applicationId,
      applicationId,
      action: 'application.edited',
      detail: { replacedLogo: Boolean(logo) },
    })
  })
}

export async function saveApplication(_prev: EditState, formData: FormData): Promise<EditState> {
  const application = await requireApplicant()
  const current = await loadSettings()

  if (!isEditable(application.status as Status)) {
    return { errors: {}, message: 'This application can no longer be edited.' }
  }
  if (windowState(current, new Date()) !== 'open') {
    return { errors: {}, message: 'Applications are closed, so this can no longer be edited.' }
  }

  const parsed = applicationInputSchema.safeParse(Object.fromEntries(formData))
  const errors: Record<string, string> = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0])
      errors[key] ??= issue.message
    }
  }

  let logo: PreparedUpload | null = null
  const file = formData.get('logo')
  if (file instanceof File && file.size > 0) {
    const prepared = prepareUpload(file.name, Buffer.from(await file.arrayBuffer()))
    if (!prepared.ok) errors.logo = prepared.error
    else logo = prepared.value
  }

  if (Object.keys(errors).length > 0 || !parsed.success) {
    return { errors, message: 'Please fix the problems below.' }
  }

  await applyEdit(application.id, parsed.data, logo)
  revalidatePath('/portal/application')
  return { errors: {}, saved: true }
}

export async function withdrawApplication(): Promise<void> {
  const application = await requireApplicant()
  if (application.status === 'withdrawn') redirect('/portal/application')

  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ status: 'withdrawn', withdrawnAt: new Date(), updatedAt: new Date() })
      .where(eq(applications.id, application.id))

    await tx.insert(auditLog).values({
      actorType: 'applicant',
      actorId: application.id,
      applicationId: application.id,
      action: 'application.withdrawn',
      detail: { from: application.status },
    })
  })

  await destroyApplicantSession()
  redirect('/portal?withdrawn=1')
}

/**
 * Records acceptance of the booth together with a frozen copy of the exact
 * terms text shown. A later edit to the terms must never rewrite what somebody
 * already agreed to.
 */
export async function recordConfirmation(applicationId: string, name: string): Promise<void> {
  const db = getDb()

  await db.transaction(async (tx) => {
    const application = await tx.query.applications.findFirst({
      where: eq(applications.id, applicationId),
    })
    if (!application) throw new Error('No such application.')

    assertTransition(application.status as Status, 'confirmed')

    const current = await tx.query.settings.findFirst({ where: eq(settings.id, 1) })
    if (!current) throw new Error('Settings row is missing.')

    await tx
      .update(applications)
      .set({
        status: 'confirmed',
        confirmedAt: new Date(),
        confirmedByName: name,
        confirmedTermsSnapshot: current.termsText,
        confirmedTermsVersion: current.termsVersion,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId))

    await tx.insert(auditLog).values({
      actorType: 'applicant',
      actorId: applicationId,
      applicationId,
      action: 'booth.confirmed',
      detail: { confirmedByName: name, termsVersion: current.termsVersion },
    })
  })
}

export async function confirmBooth(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const application = await requireApplicant()
  const name = String(formData.get('confirmedByName') ?? '').trim()

  if (name.length < 2) return { error: 'Type your full name to confirm.' }
  if (formData.get('agree') !== 'on') {
    return { error: 'Tick the box to agree to the booth terms.' }
  }

  try {
    await recordConfirmation(application.id, name)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That could not be confirmed.' }
  }

  revalidatePath('/portal/application')
  return { confirmed: true }
}

export async function postReply(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const application = await requireApplicant()
  const body = String(formData.get('body') ?? '').trim()
  if (body.length < 2) return { error: 'Write your reply first.' }

  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.insert(messages).values({
      applicationId: application.id,
      direction: 'inbound',
      subject: `Re: ${application.orgName} community booth`,
      body,
    })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'admin_reply_notification'),
    })
    if (!template) throw new Error('Missing email template: admin_reply_notification')

    const rendered = renderTemplate(template, {
      org_name: application.orgName,
      admin_url: `${getEnv().PUBLIC_BASE_URL}/admin/applications/${application.id}`,
    })

    const activeAdmins = await tx.query.admins.findMany({ where: eq(admins.isActive, true) })
    for (const admin of activeAdmins) {
      await enqueueEmail(tx, {
        to: admin.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      })
    }
  })

  revalidatePath('/portal/application')
  return { sent: true }
}
