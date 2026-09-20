import Link from 'next/link'
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications } from '@/db/schema'
import { StatusBadge } from '@/components/StatusBadge'
import { STATUS_LABELS, type Status } from '@/domain/application'
import { requireAdmin } from '@/services/auth/session'

export const dynamic = 'force-dynamic'

export default async function ApplicationList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  await requireAdmin()
  const { status, q } = await searchParams

  const filters: SQL[] = []
  if (status && status in STATUS_LABELS) filters.push(eq(applications.status, status as Status))
  if (q) {
    const needle = `%${q}%`
    filters.push(
      or(
        ilike(applications.orgName, needle),
        ilike(applications.contactName, needle),
        ilike(applications.contactEmail, needle),
        ilike(applications.website, needle),
      )!,
    )
  }

  const rows = await getDb()
    .select()
    .from(applications)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(applications.submittedAt))

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Applications</h1>
        <div className="flex gap-3">
          <a href="/admin/export/applications.csv"
            className="rounded border border-scale-blue px-4 py-2 font-semibold text-scale-blue hover:bg-scale-blue-pale/30">
            Export CSV
          </a>
          <a href="/admin/export/logos.zip"
            className="rounded border border-scale-blue px-4 py-2 font-semibold text-scale-blue hover:bg-scale-blue-pale/30">
            Logos ZIP
          </a>
        </div>
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-4" method="get">
        <div>
          <label htmlFor="status" className="block text-sm font-semibold">Status</label>
          <select id="status" name="status" defaultValue={status ?? ''}
            className="mt-1 rounded border border-scale-rule px-3 py-2">
            <option value="">All</option>
            {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
              <option key={value} value={value}>{STATUS_LABELS[value]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q" className="block text-sm font-semibold">Search</label>
          <input id="q" name="q" defaultValue={q ?? ''} placeholder="org, contact, email, website"
            className="mt-1 w-64 rounded border border-scale-rule px-3 py-2" />
        </div>
        <button type="submit"
          className="rounded bg-scale-blue px-5 py-2 font-semibold text-white hover:bg-scale-blue-hover">
          Filter
        </button>
      </form>

      <p className="mt-6 text-scale-muted" data-testid="result-count">
        {rows.length} application{rows.length === 1 ? '' : 's'}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-scale-rule/50 text-sm uppercase tracking-wide text-scale-muted">
              <th className="py-2 pr-4 font-semibold">Organization</th>
              <th className="py-2 pr-4 font-semibold">Contact</th>
              <th className="py-2 pr-4 font-semibold">Status</th>
              <th className="py-2 pr-4 font-semibold">Booth</th>
              <th className="py-2 font-semibold">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-scale-rule/20">
                <td className="py-3 pr-4">
                  <Link href={`/admin/applications/${row.id}`}
                    className="font-semibold text-scale-blue underline">{row.orgName}</Link>
                </td>
                <td className="py-3 pr-4 text-scale-muted">{row.contactEmail}</td>
                <td className="py-3 pr-4"><StatusBadge status={row.status as Status} /></td>
                <td className="py-3 pr-4">{row.boothNumber ?? '—'}</td>
                <td className="py-3 text-scale-muted">
                  {row.submittedAt.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <p className="mt-8 text-scale-muted">No applications match that filter.</p>}
    </main>
  )
}
