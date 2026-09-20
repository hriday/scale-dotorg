'use client'

import { useActionState } from 'react'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { LIMITS } from '@/validation/application'
import { submitApplication, type FormState } from './actions'

const initial: FormState = { errors: {} }

const LONG_FIELDS = [
  {
    name: 'about',
    label: 'Tell us about your organization',
    hint: 'Who you are and what you work on.',
  },
  {
    name: 'showcase',
    label: 'What will you showcase at your booth?',
    hint: 'Roughly what attendees will see, try, or talk to you about.',
  },
  {
    name: 'communityImpact',
    label: 'How does this advance advocacy and interest attendees?',
    hint: 'What our attendees get out of it, and what it does for your community.',
  },
  {
    name: 'staffingPlan',
    label: 'How will you keep someone at the booth at all times?',
    hint: 'We need at least one person at your booth for every hour the expo floor is open.',
  },
] as const

export function ApplyForm() {
  const [state, action, pending] = useActionState(submitApplication, initial)
  const errorCount = Object.keys(state.errors).length

  return (
    <form action={action} noValidate encType="multipart/form-data">
      {state.message && (
        <div
          id="form-errors"
          role="alert"
          tabIndex={-1}
          className="mb-8 rounded border-l-4 border-red-700 bg-red-50 p-4"
        >
          <p className="font-semibold text-red-800">{state.message}</p>
          {errorCount > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
              {Object.entries(state.errors).map(([field, message]) => (
                <li key={field}>
                  <a className="underline" href={`#${field}`}>
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Field label="Organization name" name="orgName" error={state.errors.orgName}>
        <input id="orgName" name="orgName" required className={inputClass} />
      </Field>

      <Field label="Contact name" name="contactName" error={state.errors.contactName}>
        <input id="contactName" name="contactName" required className={inputClass} />
      </Field>

      <Field
        label="Contact email"
        name="contactEmail"
        hint="We send everything about your application here."
        error={state.errors.contactEmail}
      >
        <input id="contactEmail" name="contactEmail" type="email" required className={inputClass} />
      </Field>

      <Field label="Website" name="website" error={state.errors.website}>
        <input
          id="website"
          name="website"
          required
          className={inputClass}
          placeholder="example.org"
        />
      </Field>

      {LONG_FIELDS.map((field) => (
        <Field
          key={field.name}
          label={field.label}
          name={field.name}
          hint={`${field.hint} Between ${LIMITS.longTextMin} and ${LIMITS.longTextMax} characters.`}
          error={state.errors[field.name]}
        >
          <textarea id={field.name} name={field.name} rows={6} required className={inputClass} />
        </Field>
      ))}

      <Field
        label="Booth sign text"
        name="signText"
        hint={`What the printed sign above your booth should say. ${LIMITS.signTextMax} characters or fewer.`}
        error={state.errors.signText}
      >
        <input
          id="signText"
          name="signText"
          maxLength={LIMITS.signTextMax}
          required
          className={inputClass}
        />
      </Field>

      <Field
        label="Logo"
        name="logo"
        hint="PNG, JPEG, SVG, or PDF, up to 2 MB. Vector or a large raster file prints best."
        error={state.errors.logo}
      >
        <input
          id="logo"
          name="logo"
          type="file"
          accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf"
          required
          className="block w-full text-base"
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  )
}
