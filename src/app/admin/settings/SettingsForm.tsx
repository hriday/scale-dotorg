'use client'

import { useActionState } from 'react'
import { saveSettings, type SettingsState } from './actions'

const initial: SettingsState = {}

const input = 'mt-1 w-full rounded border border-scale-rule px-3 py-2'

export function SettingsForm({
  settings,
}: {
  settings: {
    applicationsOpenAt: string
    applicationsCloseAt: string
    boothCap: number
    feeDollars: number
    termsText: string
    expoHours: { day: string; opens: string; closes: string }[]
  }
}) {
  const [state, action, pending] = useActionState(saveSettings, initial)

  return (
    <form action={action} className="mt-8 max-w-3xl">
      {state.saved && (
        <p id="settings-saved" className="mb-6 rounded bg-green-50 p-4 font-semibold text-green-900">
          Settings saved.
        </p>
      )}
      {state.error && (
        <p id="settings-error" role="alert" className="mb-6 rounded bg-red-50 p-4 font-semibold text-red-800">
          {state.error}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="applicationsOpenAt" className="block font-semibold">Applications open</label>
          <input id="applicationsOpenAt" name="applicationsOpenAt" type="datetime-local"
            defaultValue={settings.applicationsOpenAt} className={input} />
        </div>
        <div>
          <label htmlFor="applicationsCloseAt" className="block font-semibold">Applications close</label>
          <input id="applicationsCloseAt" name="applicationsCloseAt" type="datetime-local"
            defaultValue={settings.applicationsCloseAt} className={input} />
        </div>
        <div>
          <label htmlFor="boothCap" className="block font-semibold">Booth cap</label>
          <p className="mt-1 text-sm text-scale-muted">Shown on the dashboard. Never auto-rejects.</p>
          <input id="boothCap" name="boothCap" type="number" min={0} defaultValue={settings.boothCap} className={input} />
        </div>
        <div>
          <label htmlFor="feeDollars" className="block font-semibold">Late cancellation fee (USD)</label>
          <p className="mt-1 text-sm text-scale-muted">Shown on the public page and in emails.</p>
          <input id="feeDollars" name="feeDollars" type="number" min={0} step="0.01"
            defaultValue={settings.feeDollars} className={input} />
        </div>
      </div>

      <h2 className="mt-10 text-xl font-bold">Expo floor hours</h2>
      <p className="mt-1 text-sm text-scale-muted">
        Shown on the public page. Write TBD for anything not yet published.
      </p>
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`day${i}`} className="block text-sm font-semibold">Day</label>
              <input id={`day${i}`} name={`day${i}`} defaultValue={settings.expoHours[i]?.day ?? ''} className={input} />
            </div>
            <div>
              <label htmlFor={`opens${i}`} className="block text-sm font-semibold">Opens</label>
              <input id={`opens${i}`} name={`opens${i}`} defaultValue={settings.expoHours[i]?.opens ?? ''} className={input} />
            </div>
            <div>
              <label htmlFor={`closes${i}`} className="block text-sm font-semibold">Closes</label>
              <input id={`closes${i}`} name={`closes${i}`} defaultValue={settings.expoHours[i]?.closes ?? ''} className={input} />
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-bold">Booth terms</h2>
      <p className="mt-1 text-sm text-scale-muted">
        Shown on the confirm-booth page. Changing this raises the terms version; organizations that
        already confirmed keep a frozen copy of what they agreed to.
      </p>
      <textarea name="termsText" rows={14} defaultValue={settings.termsText}
        className="mt-2 w-full rounded border border-scale-rule px-3 py-2 font-mono text-sm" />

      <button type="submit" disabled={pending}
        className="mt-6 rounded bg-scale-blue px-5 py-3 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60">
        {pending ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
