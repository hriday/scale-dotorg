import { Button } from '@/components/Button'
import { COPY } from '@/copy'
import { EVENT } from '@/event'
import { windowState } from '@/domain/settings'
import { loadSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const settings = await loadSettings()
  const state = windowState(settings, new Date())
  const closes = settings.applicationsCloseAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  return (
    <main>
      <section className="hero-notch bg-scale-ink pb-20 text-white">
        <div className="mx-auto max-w-5xl px-6 pt-14">
          <h1 className="text-5xl font-bold tracking-tight">{COPY.programName}</h1>
          <p className="mt-4 max-w-2xl text-xl text-scale-blue-pale">{COPY.tagline}</p>
          <p className="mt-6 text-lg">
            {EVENT.dates} &middot; {EVENT.venue}, {EVENT.address}
          </p>
          <div className="mt-8">
            {state === 'open' ? (
              <Button href="/apply">Apply for a booth</Button>
            ) : (
              <p className="rounded bg-white/10 px-5 py-3 text-base">
                {state === 'before'
                  ? 'Applications are not open yet. Check back soon.'
                  : `Applications closed on ${closes}.`}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <section className="mt-12 max-w-3xl space-y-4 text-lg leading-relaxed text-scale-muted">
          {COPY.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <section>
            <h2 className="text-2xl font-bold">What SCaLE provides</h2>
            <ul className="mt-4 space-y-2 text-scale-muted">
              {COPY.provides.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="text-scale-gold">
                    &#9670;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold">What we ask in return</h2>
            <ul className="mt-4 space-y-2 text-scale-muted">
              {COPY.expects.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="text-scale-gold">
                    &#9670;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Expo floor hours</h2>
          <table className="mt-4 w-full max-w-lg border-collapse text-left">
            <thead>
              <tr className="border-b border-scale-rule/50 text-sm uppercase tracking-wide text-scale-muted">
                <th className="py-2 pr-4 font-semibold">Day</th>
                <th className="py-2 pr-4 font-semibold">Opens</th>
                <th className="py-2 font-semibold">Closes</th>
              </tr>
            </thead>
            <tbody>
              {settings.expoHours.map((slot) => (
                <tr key={slot.day} className="border-b border-scale-rule/20">
                  <td className="py-2 pr-4">{slot.day}</td>
                  <td className="py-2 pr-4">{slot.opens}</td>
                  <td className="py-2">{slot.closes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-scale-muted">
            Your booth needs someone at it for all of these hours.
          </p>
        </section>

        <section className="mt-12 rounded border-l-4 border-scale-gold bg-scale-gold-pale/25 p-6">
          <h2 className="text-2xl font-bold">The booth is free. A deposit holds it.</h2>
          <p className="mt-3 text-scale-muted">
            Booth space is limited, and every booth we hold is one that another project cannot
            have. So we ask for a <strong className="text-scale-ink">one-time deposit</strong> to
            hold yours, refunded to you at SCaLE once you are set up at your booth. If you cancel
            fewer than 30 days before the event, or do not occupy your booth during the show, we
            keep the deposit. You will see the full terms and agree to them after we accept your
            application.
          </p>
        </section>

        {state === 'open' && (
          <section className="mt-12 mb-4">
            <p className="text-scale-muted">Applications close on {closes}.</p>
            <div className="mt-4">
              <Button href="/apply">Apply for a booth</Button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
