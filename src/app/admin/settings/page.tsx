import { loadSettings } from '@/lib/settings'
import { requireAdmin } from '@/services/auth/session'
import { SettingsForm } from './SettingsForm'

export const dynamic = 'force-dynamic'

/** datetime-local wants YYYY-MM-DDTHH:mm with no zone. */
function forInput(date: Date): string {
  return date.toISOString().slice(0, 16)
}

export default async function SettingsPage() {
  await requireAdmin()
  const settings = await loadSettings()

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="mt-2 text-scale-muted">
        Times are UTC. Last updated{' '}
        {settings.updatedAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}.
      </p>
      <SettingsForm
        settings={{
          applicationsOpenAt: forInput(settings.applicationsOpenAt),
          applicationsCloseAt: forInput(settings.applicationsCloseAt),
          boothCap: settings.boothCap,
          feeDollars: settings.lateCancellationFeeCents / 100,
          termsText: settings.termsText,
          expoHours: settings.expoHours,
        }}
      />
    </main>
  )
}
