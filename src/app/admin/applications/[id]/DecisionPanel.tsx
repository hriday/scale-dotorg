'use client'

import { useActionState, useState } from 'react'
import { STATUS_LABELS, type Status } from '@/domain/status'
import { decide, type DecisionState } from './actions'

const initial: DecisionState = {}

export function DecisionPanel({
  applicationId,
  current,
  allowed,
  drafts,
}: {
  applicationId: string
  current: Status
  allowed: Status[]
  drafts: Partial<Record<Status, { subject: string; body: string }>>
}) {
  const [state, action, pending] = useActionState(decide.bind(null, applicationId), initial)
  const [target, setTarget] = useState<Status | ''>('')
  const draft = target ? drafts[target] : undefined

  return (
    <form action={action} className="rounded border border-scale-rule/40 p-5">
      <h2 className="text-xl font-bold">Decision</h2>
      <p className="mt-1 text-sm text-scale-muted">Currently {STATUS_LABELS[current]}.</p>

      {state.error && (
        <p id="decision-error" role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm font-medium text-red-800">
          {state.error}
        </p>
      )}
      {state.done && (
        <p id="decision-done" className="mt-3 rounded bg-green-50 p-3 text-sm font-medium text-green-900">
          Saved.
        </p>
      )}

      {allowed.length === 0 ? (
        <p className="mt-3 text-scale-muted">This application is in a final state.</p>
      ) : (
        <>
          <label htmlFor="status" className="mt-4 block text-sm font-semibold">Move to</label>
          <select id="status" name="status" required value={target}
            onChange={(event) => setTarget(event.target.value as Status)}
            className="mt-1 w-full rounded border border-scale-rule px-3 py-2">
            <option value="">Choose…</option>
            {allowed.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>

          {draft && (
            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="sendEmail" defaultChecked />
                Email the applicant
              </label>

              <label htmlFor="subject" className="mt-3 block text-sm font-semibold">Subject</label>
              <input id="subject" name="subject" key={`${target}-subject`} defaultValue={draft.subject}
                className="mt-1 w-full rounded border border-scale-rule px-3 py-2" />

              <label htmlFor="body" className="mt-3 block text-sm font-semibold">Message</label>
              <textarea id="body" name="body" key={`${target}-body`} rows={14} defaultValue={draft.body}
                className="mt-1 w-full rounded border border-scale-rule px-3 py-2 font-mono text-sm" />
              <p className="mt-1 text-sm text-scale-muted">
                Edit freely before sending. This exact text goes to the applicant and onto the thread.
              </p>
            </div>
          )}

          {target && !draft && (
            <p className="mt-3 text-sm text-scale-muted">This is an internal move — no email is sent.</p>
          )}

          <button type="submit" disabled={pending || !target}
            className="mt-4 rounded bg-scale-blue px-5 py-3 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60">
            {pending ? 'Saving…' : 'Apply decision'}
          </button>
        </>
      )}
    </form>
  )
}
