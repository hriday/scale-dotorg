import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { messages } from '@/db/schema'
import { Prose } from '@/components/Prose'
import { StatusBadge } from '@/components/StatusBadge'
import { EVENT } from '@/event'
import { STATUS_LABELS, isEditable, type Status } from '@/domain/application'
import { windowState } from '@/domain/settings'
import { loadSettings } from '@/lib/settings'
import { requireApplicant } from '@/services/auth/session'
import { ConfirmPanel } from './ConfirmPanel'
import { EditForm } from './EditForm'
import { ReplyForm } from './ReplyForm'
import { withdrawApplication } from './actions'

export const dynamic = 'force-dynamic'

const ANSWERS = [
  ['About the organization', 'about'],
  ['What they will showcase', 'showcase'],
  ['How it advances advocacy', 'communityImpact'],
  ['Staffing plan', 'staffingPlan'],
] as const

const LA = 'America/Los_Angeles'

export default async function ApplicationView() {
  const application = await requireApplicant()
  const settings = await loadSettings()
  const status = application.status as Status

  const thread = await getDb().query.messages.findMany({
    where: eq(messages.applicationId, application.id),
    orderBy: [asc(messages.createdAt)],
  })

  const canEdit = isEditable(status) && windowState(settings, new Date()) === 'open'

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">{application.orgName}</h1>
        <StatusBadge status={status} />
      </div>
      <p className="mt-2 text-scale-muted">
        Community booth application for {EVENT.name}, submitted{' '}
        {application.submittedAt.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: LA,
        })}
        .
      </p>

      {application.boothNumber && (
        <p className="mt-4 rounded bg-scale-blue-pale/30 px-4 py-3">
          Your booth number is <strong>{application.boothNumber}</strong>.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Your answers</h2>
        <dl className="mt-4 space-y-6">
          <div>
            <dt className="font-semibold">Contact</dt>
            <dd className="text-scale-muted">
              {application.contactName} &middot; {application.contactEmail}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Website</dt>
            <dd>
              <a className="text-scale-blue underline" href={application.website}>
                {application.website}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Booth sign text</dt>
            <dd className="text-scale-muted">{application.signText}</dd>
          </div>
          {application.logoUploadId && (
            <div>
              <dt className="font-semibold">Logo</dt>
              <dd className="mt-2">
                <img
                  src={`/logo/${application.logoUploadId}`}
                  alt={`${application.orgName} logo`}
                  className="max-h-32 rounded border border-scale-rule/40 bg-white p-2"
                />
              </dd>
            </div>
          )}
          {ANSWERS.map(([label, field]) => (
            <div key={field}>
              <dt className="font-semibold">{label}</dt>
              <dd className="mt-1">
                <Prose text={application[field]} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">Messages</h2>
        {thread.length === 0 ? (
          <p className="mt-3 text-scale-muted">
            No messages yet. We will write here when we have news or a question.
          </p>
        ) : (
          <ul className="mt-4 space-y-6">
            {thread.map((message) => (
              <li
                key={message.id}
                className={`rounded border p-4 ${
                  message.direction === 'outbound'
                    ? 'border-scale-blue-pale bg-scale-blue-pale/15'
                    : 'border-scale-rule/40 bg-white'
                }`}
              >
                <p className="text-sm font-semibold text-scale-muted">
                  {message.direction === 'outbound' ? 'SCaLE' : 'You'} &middot;{' '}
                  {message.createdAt.toLocaleString('en-US', { timeZone: LA })}
                </p>
                <p className="mt-1 font-semibold">{message.subject}</p>
                <div className="mt-2">
                  <Prose text={message.body} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {status !== 'withdrawn' && status !== 'rejected' && <ReplyForm />}
      </section>

      {status === 'accepted' && (
        <ConfirmPanel termsText={settings.termsText} boothNumber={application.boothNumber} />
      )}

      {status === 'confirmed' && application.confirmedAt && (
        <section className="mt-12 rounded border-l-4 border-green-600 bg-green-50 p-6">
          <h2 className="text-2xl font-bold">Your booth is confirmed</h2>
          <p className="mt-2 text-scale-muted">
            Confirmed by {application.confirmedByName} on{' '}
            {application.confirmedAt.toLocaleString('en-US', { timeZone: LA })}. We have kept a copy
            of the exact terms you agreed to.
          </p>
        </section>
      )}

      {canEdit && (
        <section className="mt-12 border-t border-scale-rule/40 pt-10">
          <h2 className="text-2xl font-bold">Edit your application</h2>
          <p className="mt-2 text-scale-muted">
            You can change your answers until applications close.
          </p>
          <div className="mt-6">
            <EditForm application={application} />
          </div>
        </section>
      )}

      {status !== 'withdrawn' && (
        <section className="mt-12 border-t border-scale-rule/40 pt-10">
          <h2 className="text-2xl font-bold">Withdraw</h2>
          <p className="mt-2 text-scale-muted">
            If your plans have changed, withdraw now and we will give the booth to another project.
            Doing this early costs you nothing.
          </p>
          <form action={withdrawApplication} className="mt-4">
            <button
              type="submit"
              className="rounded border border-red-700 px-5 py-3 font-semibold text-red-800 hover:bg-red-50"
            >
              Withdraw this application
            </button>
          </form>
        </section>
      )}

      <p className="mt-12 text-sm text-scale-muted">
        Current status: {STATUS_LABELS[status]}. Questions? Write to{' '}
        <a className="text-scale-blue underline" href={`mailto:${EVENT.contactEmail}`}>
          {EVENT.contactEmail}
        </a>
        .
      </p>
    </main>
  )
}
