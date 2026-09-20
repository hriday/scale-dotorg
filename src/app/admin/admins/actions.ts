'use server'

import { and, count, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { admins, auditLog, emailTemplates } from '@/db/schema'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { normalizeEmail } from '@/lib/email'
import { requireAdmin } from '@/services/auth/session'
import { issueToken } from '@/services/auth/tokens'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'

export interface AdminState {
  error?: string
  message?: string
}

export async function inviteAdmin(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const actor = await requireAdmin()
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const name = String(formData.get('name') ?? '').trim()

  if (!email.includes('@')) return { error: 'Enter a valid email address.' }
  if (name.length < 2) return { error: 'Enter the person’s name.' }

  const db = getDb()
  const existing = await db.query.admins.findFirst({ where: eq(admins.email, email) })

  if (existing?.isActive) return { error: `${email} is already an admin.` }

  await db.transaction(async (tx) => {
    const adminId = existing
      ? (await tx
          .update(admins)
          .set({ isActive: true, name, invitedBy: actor.id, invitedAt: new Date() })
          .where(eq(admins.id, existing.id))
          .returning({ id: admins.id }))[0].id
      : (await tx
          .insert(admins)
          .values({ email, name, invitedBy: actor.id, invitedAt: new Date() })
          .returning({ id: admins.id }))[0].id

    const token = await issueToken(tx, { purpose: 'admin_login', adminId })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'admin_invite'),
    })
    if (!template) throw new Error('Missing email template: admin_invite')

    const rendered = renderTemplate(template, {
      admin_name: name,
      inviter_name: actor.name,
      event: EVENT.name,
      contact_email: EVENT.contactEmail,
      admin_url: `${getEnv().PUBLIC_BASE_URL}/admin/enter?token=${token}`,
    })

    await enqueueEmail(tx, {
      to: email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: actor.id,
      action: 'admin.invited',
      detail: { email, name },
    })
  })

  revalidatePath('/admin/admins')
  return { message: `Invited ${email}. Their sign-in link expires in 30 minutes.` }
}

export async function deactivateAdmin(adminId: string): Promise<void> {
  const actor = await requireAdmin()
  const db = getDb()

  // Two guards worth having: you cannot lock yourself out, and the last active
  // admin cannot be removed or nobody can ever sign in again.
  if (adminId === actor.id) throw new Error('You cannot deactivate yourself.')

  const [{ total }] = await db
    .select({ total: count() })
    .from(admins)
    .where(and(eq(admins.isActive, true), ne(admins.id, adminId)))

  if (total === 0) throw new Error('At least one admin must stay active.')

  await db.transaction(async (tx) => {
    await tx.update(admins).set({ isActive: false }).where(eq(admins.id, adminId))
    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: actor.id,
      action: 'admin.deactivated',
      detail: { adminId },
    })
  })

  revalidatePath('/admin/admins')
}
