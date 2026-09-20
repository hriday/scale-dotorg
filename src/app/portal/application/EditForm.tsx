'use client'

import { useActionState } from 'react'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { LIMITS } from '@/validation/application'
import { saveApplication, type EditState } from './actions'

const initial: EditState = { errors: {} }

const LONG_FIELDS = [
  { name: 'about', label: 'Tell us about your organization' },
  { name: 'showcase', label: 'What will you showcase at your booth?' },
  { name: 'communityImpact', label: 'How does this advance advocacy and interest attendees?' },
  { name: 'staffingPlan', label: 'How will you keep someone at the booth at all times?' },
] as const

export function EditForm({
  application,
}: {
  application: {
    orgName: string; contactName: string; contactEmail: string; website: string
    about: string; showcase: string; communityImpact: string; staffingPlan: string; signText: string
  }
}) {
  const [state, action, pending] = useActionState(saveApplication, initial)

  return (
    <form action={action} noValidate encType="multipart/form-data">
      {state.saved && (
        <p id="edit-saved" className="mb-6 rounded bg-green-50 p-4 font-semibold text-green-900">
          Your changes are saved.
        </p>
      )}
      {state.message && (
        <div id="edit-errors" role="alert" className="mb-6 rounded border-l-4 border-red-700 bg-red-50 p-4">
          <p className="font-semibold text-red-800">{state.message}</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
            {Object.entries(state.errors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <Field label="Organization name" name="orgName" error={state.errors.orgName}>
        <input id="orgName" name="orgName" defaultValue={application.orgName} required className={inputClass} />
      </Field>
      <Field label="Contact name" name="contactName" error={state.errors.contactName}>
        <input id="contactName" name="contactName" defaultValue={application.contactName} required className={inputClass} />
      </Field>
      <Field label="Contact email" name="contactEmail" error={state.errors.contactEmail}>
        <input id="contactEmail" name="contactEmail" type="email" defaultValue={application.contactEmail} required className={inputClass} />
      </Field>
      <Field label="Website" name="website" error={state.errors.website}>
        <input id="website" name="website" defaultValue={application.website} required className={inputClass} />
      </Field>

      {LONG_FIELDS.map((field) => (
        <Field key={field.name} label={field.label} name={field.name} error={state.errors[field.name]}>
          <textarea id={field.name} name={field.name} rows={6} defaultValue={application[field.name]} required className={inputClass} />
        </Field>
      ))}

      <Field label="Booth sign text" name="signText" error={state.errors.signText}>
        <input id="signText" name="signText" maxLength={LIMITS.signTextMax} defaultValue={application.signText} required className={inputClass} />
      </Field>

      <Field label="Replace logo" name="logo" hint="Leave empty to keep the logo you already sent." error={state.errors.logo}>
        <input id="logo" name="logo" type="file"
          accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf"
          className="block w-full text-base" />
      </Field>

      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
    </form>
  )
}
