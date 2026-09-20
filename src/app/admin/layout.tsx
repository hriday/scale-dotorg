import Link from 'next/link'
import { getAdminSession } from '@/services/auth/session'
import { signOut } from './login/actions'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The login page and entry route live under /admin and must stay reachable
  // while signed out, so this layout only adds chrome for a signed-in admin.
  // Access itself is enforced by requireAdmin() in each protected page.
  const admin = await getAdminSession()
  if (!admin) return <>{children}</>

  return (
    <div>
      <nav className="border-b border-scale-rule/40 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-3 text-sm">
          <Link href="/admin" className="font-semibold hover:text-scale-blue">Dashboard</Link>
          <Link href="/admin/applications" className="font-semibold hover:text-scale-blue">Applications</Link>
          <Link href="/admin/settings" className="font-semibold hover:text-scale-blue">Settings</Link>
          <Link href="/admin/templates" className="font-semibold hover:text-scale-blue">Templates</Link>
          <Link href="/admin/admins" className="font-semibold hover:text-scale-blue">Admins</Link>
          <span className="ml-auto text-scale-muted" data-testid="admin-identity">
            {admin.name} &middot; {admin.email}
          </span>
          <form action={signOut}>
            <button type="submit" className="font-semibold text-scale-blue hover:underline">Sign out</button>
          </form>
        </div>
      </nav>
      {children}
    </div>
  )
}
