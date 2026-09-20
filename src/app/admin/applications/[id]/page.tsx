import { asc, desc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getDb } from '@/db/client'
import { admins, applications, auditLog, internalNotes, messages } from '@/db/schema'
import { Prose } from '@/components/Prose'
import { StatusBadge } from '@/components/StatusBadge'
import { TRANSITIONS, type Status } from '@/domain/application'
import { requireAdmin } from '@/services/auth/session'
import { DecisionPanel } from './DecisionPanel'
import { NoteForm } from './NoteForm'
import { assignBoothNumber, defaultDecisionEmail, markThreadRead } from './actions'

export const dynamic = 'force-dynamic'

const ANSWERS = [
  ['About the organization', 'about'],
  ['What they will showcase', 'showcase'],
  ['How it advances advocacy', 'communityImpact'],
  ['Staffing plan', 'staffingPlan'],
] as const

const LA = 'America/Los_Angeles'

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const db = getDb()

  const application = await db.query.applications.findFirst({ where: eq(applications.id, id) })
  if (!application) notFound()

  // Opening the page is what "reading" a reply means.
  await markThreadRead(id)

  const notes = await db
    .select({
      id: internalNotes.id,
      body: internalNotes.body,
      createdAt: internalNotes.createdAt,
      authorName: admins.name,
    })
    .from(internalNotes)
    .leftJoin(admins, eq(internalNotes.adminId, admins.id))
    .where(eq(internalNotes.applicationId, id))
    .orderBy(desc(internalNotes.createdAt))

  const thread = await db.query.messages.findMany({
    where: eq(messages.applicationId, id),
    orderBy: [asc(messages.createdAt)],
  })

  const trail = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.applicationId, id))
    .orderBy(desc(auditLog.createdAt))
    .limit(25)

  const allowed = [...TRANSITIONS[application.status as Status]]
  const drafts: Partial<Record<Status, { subject: string; body: string }>> = {}
  for (const status of allowed) {
    const draft = await defaultDecisionEmail(application.id, status)
    if (draft) drafts[status] = draft
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{application.orgName}</h1>
        <StatusBadge status={application.status as Status} />
      </div>
      <p className="mt-2 text-scale-muted">
        {application.contactName} &middot;{' '}
        <a className="text-scale-blue underline" href={`mailto:${application.contactEmail}`}>
          {application.contactEmail}
        </a>{' '}
        &middot;{' '}
        <a className="text-scale-blue underline" href={application.website}>
          {application.website}
        </a>
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section>
            <h2 className="text-xl font-bold">Booth sign</h2>
            <p className="mt-2 rounded border border-scale-rule/40 bg-scale-ink px-6 py-4 text-center text-2xl font-bold text-white">
              {application.signText}
            </p>
            {application.logoUploadId && (
              <img
                src={`/logo/${application.logoUploadId}`}
                alt={`${application.orgName} logo`}
                className="mt-4 max-h-40 rounded border border-scale-rule/40 bg-white p-3"
              />
            )}
          </section>

          <section className="mt-10 space-y-8">
            {ANSWERS.map(([label, field]) => (
              <div key={field}>
                <h2 className="text-xl font-bold">{label}</h2>
                <div className="mt-2">
                  <Prose text={application[field]} />
                </div>
              </div>
            ))}
          </section>

          <section className="mt-12">
            <h2 className="text-xl font-bold">Messages with the applicant</h2>
            {thread.length === 0 ? (
              <p className="mt-2 text-scale-muted">Nothing sent yet.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {thread.map((message) => (
                  <li key={message.id} className="rounded border border-scale-rule/40 p-4">
                    <p className="text-sm font-semibold text-scale-muted">
                      {message.direction === 'outbound' ? 'SCaLE → applicant' : 'Applicant → SCaLE'}{' '}
                      &middot; {message.createdAt.toLocaleString('en-US', { timeZone: LA })}
                    </p>
                    <p className="mt-1 font-semibold">{message.subject}</p>
                    <div className="mt-2">
                      <Prose text={message.body} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside>
          <DecisionPanel
            applicationId={application.id}
            current={application.status as Status}
            allowed={allowed}
            drafts={drafts}
          />

          <section className="mt-6 rounded border border-scale-rule/40 p-5">
            <h2 className="text-xl font-bold">Booth number</h2>
            <form action={assignBoothNumber.bind(null, application.id)} className="mt-3 flex gap-2">
              <input
                name="boothNumber"
                defaultValue={application.boothNumber ?? ''}
                placeholder="e.g. 412"
                className="w-full rounded border border-scale-rule px-3 py-2"
              />
              <button
                type="submit"
                className="rounded bg-scale-blue px-4 py-2 font-semibold text-white hover:bg-scale-blue-hover"
              >
                Save
              </button>
            </form>
          </section>

          {application.confirmedAt && (
            <section className="mt-6 rounded border border-green-600 bg-green-50 p-5">
              <h2 className="text-xl font-bold">Confirmed</h2>
              <p className="mt-2 text-sm text-scale-muted">
                By {application.confirmedByName} on{' '}
                {application.confirmedAt.toLocaleString('en-US', { timeZone: LA })}, agreeing to
                terms version {application.confirmedTermsVersion}.
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-scale-blue">
                  Show the exact terms they agreed to
                </summary>
                <div className="mt-2 max-h-64 overflow-y-auto rounded border border-scale-rule/40 bg-white p-3 text-sm">
                  <Prose text={application.confirmedTermsSnapshot ?? ''} />
                </div>
              </details>
            </section>
          )}

          <section className="mt-6 rounded border border-scale-gold bg-scale-gold-pale/20 p-5">
            <h2 className="text-xl font-bold">Internal notes</h2>
            <NoteForm applicationId={application.id} />
            <ul className="mt-6 space-y-4">
              {notes.map((note) => (
                <li key={note.id} className="border-t border-scale-rule/30 pt-3">
                  <p className="text-sm font-semibold text-scale-muted">
                    {note.authorName ?? 'Unknown'} &middot;{' '}
                    {note.createdAt.toLocaleString('en-US', { timeZone: LA })}
                  </p>
                  <div className="mt-1">
                    <Prose text={note.body} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 rounded border border-scale-rule/40 p-5">
            <h2 className="text-xl font-bold">History</h2>
            <ul className="mt-3 space-y-2 text-sm text-scale-muted">
              {trail.map((entry) => (
                <li key={entry.id}>
                  <span className="font-semibold">{entry.action}</span> &middot;{' '}
                  {entry.createdAt.toLocaleString('en-US', { timeZone: LA })}
                </li>
              ))}
              {trail.length === 0 && <li>Nothing recorded yet.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  )
}
