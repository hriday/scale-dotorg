'use client'

import { useActionState } from 'react'
import { inviteAdmin, type AdminState } from './actions'

const initial: AdminState = {}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteAdmin, initial)

  return (
    <form action={action} className="mt-6 max-w-xl rounded border border-scale-rule/40 p-5">
      <h2 className="text-xl font-bold">Invite an admin</h2>
      {state.message && (
        <p id="invite-ok" className="mt-3 rounded bg-green-50 p-3 font-medium text-green-900">{state.message}</p>
      )}
      {state.error && (
        <p id="invite-error" role="alert" className="mt-3 rounded bg-red-50 p-3 font-medium text-red-800">{state.error}</p>
      )}

      <label htmlFor="name" className="mt-4 block font-semibold">Name</label>
      <input id="name" name="name" required className="mt-1 w-full rounded border border-scale-rule px-3 py-2" />

      <label htmlFor="email" className="mt-4 block font-semibold">Email address</label>
      <input id="email" name="email" type="email" required
        className="mt-1 w-full rounded border border-scale-rule px-3 py-2" />

      <button type="submit" disabled={pending}
        className="mt-4 rounded bg-scale-blue px-5 py-2 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60">
        {pending ? 'Inviting…' : 'Send invitation'}
      </button>
    </form>
  )
}
