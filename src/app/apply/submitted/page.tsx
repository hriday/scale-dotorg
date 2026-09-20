import { EVENT } from '@/event'

export default function Submitted() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">Application received</h1>
      <p className="mt-4 text-lg text-scale-muted">
        Thanks. We have sent a confirmation to the address you gave us, with a link back to your
        application. Use that link to make changes before the deadline or to see messages from us.
      </p>
      <p className="mt-4 text-scale-muted">
        Nothing in your inbox after a few minutes? Check your spam folder, then write to{' '}
        <a className="text-scale-blue underline" href={`mailto:${EVENT.contactEmail}`}>
          {EVENT.contactEmail}
        </a>
        .
      </p>
    </main>
  )
}
