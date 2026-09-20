'use client'

import { useActionState } from 'react'
import { addNote, type NoteState } from './actions'

const initial: NoteState = {}

export function NoteForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(addNote.bind(null, applicationId), initial)

  return (
    <form action={action} className="mt-4">
      <label htmlFor="body" className="block text-sm font-semibold">Add an internal note</label>
      <p className="mt-1 text-sm text-scale-muted">
        Only admins can see these. The applicant never does.
      </p>
      <textarea id="body" name="body" rows={3}
        className="mt-2 w-full rounded border border-scale-rule px-3 py-2" />
      {state.error && <p className="mt-2 text-sm font-medium text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="mt-2 rounded bg-scale-blue px-4 py-2 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60">
        {pending ? 'Saving…' : 'Add note'}
      </button>
    </form>
  )
}
