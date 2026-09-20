import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { admins } from '@/db/schema'
import { createAdminSession } from '@/services/auth/session'
import { consumeToken } from '@/services/auth/tokens'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) redirect('/admin/login?expired=1')

  const subject = await consumeToken(token, 'admin_login')
  if (!subject?.adminId) redirect('/admin/login?expired=1')

  await getDb().update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, subject.adminId))
  await createAdminSession(subject.adminId)
  redirect('/admin')
}
