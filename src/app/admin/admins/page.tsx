import { asc } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { admins } from '@/db/schema'
import { requireAdmin } from '@/services/auth/session'
import { InviteForm } from './InviteForm'
import { deactivateAdmin } from './actions'

export const dynamic = 'force-dynamic'

const LA = 'America/Los_Angeles'

export default async function AdminsPage() {
  const me = await requireAdmin()
  const rows = await getDb().select().from(admins).orderBy(asc(admins.email))

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-bold">Admins</h1>
      <p className="mt-2 text-scale-muted">
        Anyone listed here can sign in with a magic link and decide applications. Deactivated
        admins keep their name on past decisions.
      </p>

      <InviteForm />

      <table className="mt-10 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-scale-rule/50 text-sm uppercase tracking-wide text-scale-muted">
            <th className="py-2 pr-4 font-semibold">Name</th>
            <th className="py-2 pr-4 font-semibold">Email</th>
            <th className="py-2 pr-4 font-semibold">Last signed in</th>
            <th className="py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((admin) => (
            <tr key={admin.id} className="border-b border-scale-rule/20">
              <td className="py-3 pr-4">{admin.name}</td>
              <td className="py-3 pr-4 text-scale-muted">{admin.email}</td>
              <td className="py-3 pr-4 text-scale-muted">
                {admin.lastLoginAt ? admin.lastLoginAt.toLocaleString('en-US', { timeZone: LA }) : 'Never'}
              </td>
              <td className="py-3">
                {admin.isActive ? (
                  admin.id === me.id ? (
                    <span className="text-scale-muted">Active (you)</span>
                  ) : (
                    <form action={deactivateAdmin.bind(null, admin.id)}>
                      <button type="submit" className="text-sm font-semibold text-red-700 hover:underline">
                        Deactivate
                      </button>
                    </form>
                  )
                ) : (
                  <span className="text-scale-muted">Deactivated</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
