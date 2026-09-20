'use client'

import { useActionState } from 'react'
import { confirmBooth, type ConfirmState } from './actions'

const initial: ConfirmState = {}

export function ConfirmPanel({
  termsText,
  boothNumber,
}: {
  termsText: string
  boothNumber: string | null
}) {
  const [state, action, pending] = useActionState(confirmBooth, initial)

  return (
    <section className="mt-12 rounded border-l-4 border-scale-gold bg-scale-gold-pale/25 p-6">
      <h2 className="text-2xl font-bold">You have a booth. Please confirm it.</h2>
      {boothNumber && (
        <p className="mt-2">Your booth number is <strong>{boothNumber}</strong>.</p>
      )}

      <div className="mt-4 max-h-72 overflow-y-auto rounded border border-scale-rule/40 bg-white p-4">
        <div className="space-y-3 whitespace-pre-wrap text-scale-muted">
          {termsText.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>

      {state.error && (
        <p id="confirm-error" role="alert" className="mt-3 rounded bg-red-50 p-3 font-medium text-red-800">
          {state.error}
        </p>
      )}

      <form action={action} className="mt-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="agree" className="mt-1" />
          <span>I have read the booth terms above and accept them on behalf of my organization.</span>
        </label>

        <label htmlFor="confirmedByName" className="mt-4 block font-semibold">Your full name</label>
        <input id="confirmedByName" name="confirmedByName"
          className="mt-1 w-full max-w-sm rounded border border-scale-rule px-3 py-2" />

        <button type="submit" disabled={pending}
          className="mt-4 rounded bg-scale-blue px-5 py-3 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60">
          {pending ? 'Confirming…' : 'Confirm our booth'}
        </button>
      </form>
    </section>
  )
}
