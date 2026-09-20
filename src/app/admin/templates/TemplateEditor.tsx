'use client'

import { useActionState } from 'react'
import { saveTemplate, type TemplateState } from './actions'

const initial: TemplateState = {}

export function TemplateEditor({
  template,
}: {
  template: { key: string; name: string; subject: string; body: string; variables: string[] }
}) {
  const [state, action, pending] = useActionState(saveTemplate.bind(null, template.key), initial)

  return (
    <details className="rounded border border-scale-rule/40 p-5">
      <summary className="cursor-pointer text-lg font-bold">
        {template.name} <span className="font-normal text-scale-muted">({template.key})</span>
      </summary>

      <form action={action} className="mt-4">
        {state.saved && (
          <p className="mb-4 rounded bg-green-50 p-3 font-medium text-green-900">Saved.</p>
        )}
        {state.error && (
          <p role="alert" className="mb-4 rounded bg-red-50 p-3 font-medium text-red-800">{state.error}</p>
        )}

        <p className="text-sm text-scale-muted">
          Available placeholders:{' '}
          {template.variables.map((v) => (
            <code key={v} className="mr-2 rounded bg-neutral-100 px-1">{`{{${v}}}`}</code>
          ))}
        </p>

        <label htmlFor={`${template.key}-subject`} className="mt-4 block font-semibold">Subject</label>
        <input id={`${template.key}-subject`} name="subject" defaultValue={template.subject}
          className="mt-1 w-full rounded border border-scale-rule px-3 py-2" />

        <label htmlFor={`${template.key}-body`} className="mt-4 block font-semibold">Body</label>
        <textarea id={`${template.key}-body`} name="body" rows={14} defaultValue={template.body}
          className="mt-1 w-full rounded border border-scale-rule px-3 py-2 font-mono text-sm" />

        <button type="submit" disabled={pending}
          className="mt-4 rounded bg-scale-blue px-5 py-2 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60">
          {pending ? 'Saving…' : 'Save template'}
        </button>
      </form>
    </details>
  )
}
