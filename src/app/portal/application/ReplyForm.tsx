'use client'

import { useActionState } from 'react'
import { postReply, type ReplyState } from './actions'

const initial: ReplyState = {}

export function ReplyForm() {
  const [state, action, pending] = useActionState(postReply, initial)

  return (
    <form action={action} className="mt-6">
      <label htmlFor="body" className="block font-semibold">Reply to SCaLE</label>
      {state.sent && (
        <p id="reply-sent" className="mt-2 rounded bg-green-50 p-3 font-medium text-green-900">
          Sent. We will get back to you here.
        </p>
      )}
      {state.error && <p className="mt-2 text-sm font-medium text-red-700">{state.error}</p>}
      <textarea id="body" name="body" rows={5} className="mt-2 w-full rounded border border-scale-rule px-3 py-2" />
      <button type="submit" disabled={pending}
        className="mt-2 rounded bg-scale-blue px-5 py-3 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60">
        {pending ? 'Sending…' : 'Send reply'}
      </button>
    </form>
  )
}
