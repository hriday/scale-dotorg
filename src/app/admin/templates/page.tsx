import { asc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { emailTemplates } from '@/db/schema'
import { requireAdmin } from '@/services/auth/session'
import { TemplateEditor } from './TemplateEditor'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  await requireAdmin()
  const rows = await getDb()
    .select()
    .from(emailTemplates)
    .orderBy(asc(emailTemplates.name))

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-bold">Email templates</h1>
      <p className="mt-2 text-scale-muted">
        These are the defaults the compose box is filled with. Admins can still edit any message
        before sending it. Placeholders are substituted literally — nothing is evaluated.
      </p>

      <div className="mt-8 space-y-4">
        {rows.map((template) => (
          <TemplateEditor key={template.key} template={template} />
        ))}
      </div>
    </main>
  )
}
