'use server'

import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { getDb } from '@/db/client'
import { applications, emailTemplates } from '@/db/schema'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { normalizeEmail } from '@/lib/email'
import { hit } from '@/lib/ratelimit'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'
import { issueToken } from '@/services/auth/tokens'

export interface PortalFormState {
  sent: boolean
  error?: string
}

/** Queues a portal link, but only if that address actually has an application. */
export async function sendPortalLink(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail)
  const db = getDb()

  const application = await db.query.applications.findFirst({
    where: eq(applications.contactEmail, email),
    orderBy: [desc(applications.submittedAt)],
  })
  if (!application) return

  await db.transaction(async (tx) => {
    const token = await issueToken(tx, {
      purpose: 'applicant_portal',
      applicationId: application.id,
    })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'magic_link_applicant'),
    })
    if (!template) throw new Error('Missing email template: magic_link_applicant')

    const rendered = renderTemplate(template, {
      event: EVENT.name,
      contact_email: EVENT.contactEmail,
      portal_url: `${getEnv().PUBLIC_BASE_URL}/portal/enter?token=${token}`,
    })

    await enqueueEmail(tx, {
      to: application.contactEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })
  })
}

export async function requestPortalLink(
  _prev: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  if (!email.includes('@')) {
    return { sent: false, error: 'Enter the email address you applied with.' }
  }

  // Limit by address, not only by IP: a shared office NAT should not lock out a
  // second organization applying from the same building.
  if (!hit(`portal-link:${email}`, 3, 3_600_000)) return { sent: true }

  const forwarded = (await headers()).get('x-forwarded-for') ?? 'unknown'
  if (!hit(`portal-link-ip:${forwarded.split(',')[0]!.trim()}`, 20, 3_600_000)) return { sent: true }

  await sendPortalLink(email)
  // Identical response whether or not an application exists.
  return { sent: true }
}
