'use client'

import { useActionState } from 'react'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { requestAdminLink, type AdminLoginState } from './actions'

const initial: AdminLoginState = { sent: false }

export default function AdminLogin() {
  const [state, action, pending] = useActionState(requestAdminLink, initial)

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-4xl font-bold">Community Booths admin</h1>

      {state.sent ? (
        <div id="admin-sent" className="mt-6 rounded border-l-4 border-scale-blue bg-scale-blue-pale/25 p-4">
          <p className="font-semibold">Check your email.</p>
          <p className="mt-2 text-scale-muted">
            If that address is an admin, we have sent a sign-in link. It works once and expires in
            30 minutes.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-scale-muted">Sign in with a link sent to your SCaLE address.</p>
          <form action={action} noValidate className="mt-8">
            <Field label="Email address" name="email" error={state.error}>
              <input id="email" name="email" type="email" required className={inputClass} />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </form>
        </>
      )}
    </main>
  )
}
