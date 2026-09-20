'use client'

import { useActionState } from 'react'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { requestPortalLink, type PortalFormState } from './actions'

const initial: PortalFormState = { sent: false }

export default function Portal() {
  const [state, action, pending] = useActionState(requestPortalLink, initial)

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-4xl font-bold">Your booth application</h1>

      {state.sent ? (
        <div id="portal-sent" className="mt-6 rounded border-l-4 border-scale-blue bg-scale-blue-pale/25 p-4">
          <p className="font-semibold">Check your email.</p>
          <p className="mt-2 text-scale-muted">
            If we have an application for that address, we have sent a link to it. The link works
            for 7 days.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-scale-muted">
            Enter the email address you applied with and we will send you a link to your
            application.
          </p>
          <form action={action} noValidate className="mt-8">
            <Field label="Email address" name="email" error={state.error}>
              <input id="email" name="email" type="email" required className={inputClass} />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Email me a link'}
            </Button>
          </form>
        </>
      )}
    </main>
  )
}
