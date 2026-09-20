import { EVENT } from '@/event'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-scale-rule/40 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-scale-muted">
        <p>
          {EVENT.name} &middot; {EVENT.dates} &middot; {EVENT.venue}, {EVENT.address}
        </p>
        <p className="mt-2">
          Questions?{' '}
          <a className="text-scale-blue underline" href={`mailto:${EVENT.contactEmail}`}>
            {EVENT.contactEmail}
          </a>{' '}
          &middot;{' '}
          <a className="text-scale-blue underline" href="https://www.socallinuxexpo.org">
            socallinuxexpo.org
          </a>
        </p>
      </div>
    </footer>
  )
}
