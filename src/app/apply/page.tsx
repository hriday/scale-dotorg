import { ApplyForm } from './ApplyForm'
import { COPY } from '@/copy'
import { EVENT } from '@/event'
import { windowState } from '@/domain/settings'
import { loadSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function Apply() {
  const settings = await loadSettings()
  const state = windowState(settings, new Date())

  if (state !== 'open') {
    const closes = settings.applicationsCloseAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    })
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold">
          Applications are {state === 'before' ? 'not open yet' : 'closed'}
        </h1>
        <p className="mt-4 text-scale-muted">
          {state === 'before'
            ? `Applications for ${COPY.programName} at ${EVENT.name} have not opened yet. Check back soon.`
            : `Applications closed on ${closes}. Write to ${EVENT.contactEmail} if you think you should still be able to apply.`}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-bold">Apply for a community booth</h1>
      <p className="mt-4 text-lg text-scale-muted">
        {EVENT.name} &middot; {EVENT.dates} &middot; {EVENT.venue}
      </p>
      <p className="mt-6 rounded border-l-4 border-scale-gold bg-scale-gold-pale/25 p-4 text-scale-muted">
        The booth is free. Holding it takes a{' '}
        <strong className="text-scale-ink">one-time deposit</strong>, refunded to you at SCaLE once
        you are set up at your booth. If we accept you and you cancel fewer than 30 days before the
        event, or do not occupy your booth, we keep it. You will see the full terms and agree to
        them after we accept you.
      </p>
      <div className="mt-10">
        <ApplyForm />
      </div>
    </main>
  )
}
