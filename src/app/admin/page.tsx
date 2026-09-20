import Link from 'next/link'
import { count, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications, emailOutbox, messages } from '@/db/schema'
import { STATUS_LABELS, type Status } from '@/domain/application'
import { loadSettings } from '@/lib/settings'
import { requireAdmin } from '@/services/auth/session'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  await requireAdmin()
  const db = getDb()
  const settings = await loadSettings()

  const byStatus = await db
    .select({ status: applications.status, total: count() })
    .from(applications)
    .groupBy(applications.status)

  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r.total])) as Record<
    Status,
    number | undefined
  >

  const accepted = (counts.accepted ?? 0) + (counts.confirmed ?? 0)

  const [unanswered] = await db
    .select({ total: count() })
    .from(messages)
    .where(sql`${messages.direction} = 'inbound' AND ${messages.readByAdminAt} IS NULL`)

  const [failedMail] = await db
    .select({ total: count() })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, 'failed'))

  const tiles = [
    { label: 'Booths accepted', value: `${accepted} of ${settings.boothCap}` },
    { label: 'Awaiting confirmation', value: counts.accepted ?? 0 },
    { label: 'Unanswered replies', value: unanswered?.total ?? 0 },
    { label: 'Failed emails', value: failedMail?.total ?? 0 },
  ]

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded border border-scale-rule/40 p-5">
            <p className="text-sm uppercase tracking-wide text-scale-muted">{tile.label}</p>
            <p className="mt-2 text-3xl font-bold">{tile.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-2xl font-bold">By status</h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(STATUS_LABELS) as Status[]).map((status) => (
          <li key={status}>
            <Link
              href={`/admin/applications?status=${status}`}
              className="flex items-center justify-between rounded border border-scale-rule/40 px-4 py-3 hover:border-scale-blue"
            >
              <span>{STATUS_LABELS[status]}</span>
              <span className="font-bold">{counts[status] ?? 0}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
