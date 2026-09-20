'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { auditLog, emailTemplates } from '@/db/schema'
import { requireAdmin } from '@/services/auth/session'
import { renderTemplate } from '@/services/mail/render'

export interface TemplateState {
  error?: string
  saved?: boolean
}

const SAMPLE: Record<string, string> = {
  contact_name: 'Jane Maintainer',
  admin_name: 'Bala',
  org_name: 'The Debian Project',
  event: 'SCaLE 24x',
  contact_email: 'dotorgs@socallinuxexpo.org',
  fee: '$1,000',
  portal_url: 'https://example.org/portal',
  admin_url: 'https://example.org/admin/applications/123',
}

/** Renders a template against representative values, for the preview pane. */
export async function previewTemplate(subject: string, body: string) {
  return renderTemplate({ subject, body }, SAMPLE)
}

export async function saveTemplate(
  key: string,
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const admin = await requireAdmin()
  const subject = String(formData.get('subject') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!subject) return { error: 'A template needs a subject.' }
  if (body.length < 10) return { error: 'A template needs a body.' }

  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .update(emailTemplates)
      .set({ subject, body, updatedAt: new Date(), updatedBy: admin.id })
      .where(eq(emailTemplates.key, key))

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: admin.id,
      action: 'template.updated',
      detail: { key },
    })
  })

  revalidatePath('/admin/templates')
  return { saved: true }
}
