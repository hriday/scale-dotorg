'use server'

import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { admins, emailTemplates } from '@/db/schema'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { normalizeEmail } from '@/lib/email'
import { hit } from '@/lib/ratelimit'
import { destroyAdminSession } from '@/services/auth/session'
import { issueToken } from '@/services/auth/tokens'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'

export interface AdminLoginState {
  sent: boolean
  error?: string
}

/** Queues an admin sign-in link, but only for an allowlisted, active admin. */
export async function sendAdminLink(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail)
  const db = getDb()

  const admin = await db.query.admins.findFirst({
    where: and(eq(admins.email, email), eq(admins.isActive, true)),
  })
  if (!admin) return

  await db.transaction(async (tx) => {
    const token = await issueToken(tx, { purpose: 'admin_login', adminId: admin.id })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'magic_link_admin'),
    })
    if (!template) throw new Error('Missing email template: magic_link_admin')

    const rendered = renderTemplate(template, {
      admin_name: admin.name,
      event: EVENT.name,
      contact_email: EVENT.contactEmail,
      admin_url: `${getEnv().PUBLIC_BASE_URL}/admin/enter?token=${token}`,
    })

    await enqueueEmail(tx, {
      to: admin.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })
  })
}

export async function requestAdminLink(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  if (!email.includes('@')) return { sent: false, error: 'Enter your admin email address.' }

  const forwarded = (await headers()).get('x-forwarded-for') ?? 'unknown'
  if (!hit(`admin-link:${email}`, 5, 3_600_000)) return { sent: true }
  if (!hit(`admin-link-ip:${forwarded.split(',')[0]!.trim()}`, 20, 3_600_000)) return { sent: true }

  await sendAdminLink(email)
  // Identical response whether or not the address is an admin.
  return { sent: true }
}

export async function signOut(): Promise<void> {
  await destroyAdminSession()
  redirect('/admin/login')
}
