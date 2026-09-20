import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications, authTokens, emailTemplates, uploads } from '@/db/schema'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'
import type { PreparedUpload } from '@/services/uploads'
import type { ApplicationInput } from '@/validation/application'
import { APPLICANT_TOKEN_DAYS, hashToken, newToken } from '@/services/auth/tokens'

export { APPLICANT_TOKEN_DAYS, hashToken, newToken }

export async function createApplication(
  input: ApplicationInput,
  logo: PreparedUpload,
): Promise<{ id: string; token: string }> {
  const db = getDb()
  const env = getEnv()
  const token = newToken()

  return db.transaction(async (tx) => {
    const [application] = await tx.insert(applications).values(input).returning()

    const [upload] = await tx
      .insert(uploads)
      .values({ ...logo, applicationId: application.id })
      .returning({ id: uploads.id })

    await tx
      .update(applications)
      .set({ logoUploadId: upload.id })
      .where(eq(applications.id, application.id))

    const expiresAt = new Date(Date.now() + APPLICANT_TOKEN_DAYS * 86_400_000)
    await tx.insert(authTokens).values({
      tokenHash: hashToken(token),
      purpose: 'applicant_portal',
      applicationId: application.id,
      expiresAt,
    })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'submission_receipt'),
    })
    if (!template) throw new Error('Missing email template: submission_receipt')

    const rendered = renderTemplate(template, {
      contact_name: application.contactName,
      org_name: application.orgName,
      event: EVENT.name,
      contact_email: EVENT.contactEmail,
      portal_url: `${env.PUBLIC_BASE_URL}/portal/enter?token=${token}`,
    })

    await enqueueEmail(tx, {
      to: application.contactEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })

    return { id: application.id, token }
  })
}
