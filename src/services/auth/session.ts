import { and, eq, gt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { admins, applications, sessions } from '@/db/schema'
import { hashToken, newToken } from './tokens'

export const ADMIN_COOKIE = 'booth_admin'
export const APPLICANT_COOKIE = 'booth_applicant'

const ADMIN_SESSION_DAYS = 7
const APPLICANT_SESSION_DAYS = 30

async function startSession(
  cookieName: string,
  days: number,
  subject: { subjectType: 'admin' | 'applicant'; adminId?: string; applicationId?: string },
): Promise<void> {
  const raw = newToken()
  const expiresAt = new Date(Date.now() + days * 86_400_000)

  await getDb().insert(sessions).values({
    tokenHash: hashToken(raw),
    subjectType: subject.subjectType,
    adminId: subject.adminId ?? null,
    applicationId: subject.applicationId ?? null,
    expiresAt,
  })

  const store = await cookies()
  store.set(cookieName, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function createAdminSession(adminId: string): Promise<void> {
  await startSession(ADMIN_COOKIE, ADMIN_SESSION_DAYS, { subjectType: 'admin', adminId })
}

export async function createApplicantSession(applicationId: string): Promise<void> {
  await startSession(APPLICANT_COOKIE, APPLICANT_SESSION_DAYS, {
    subjectType: 'applicant',
    applicationId,
  })
}

async function readSession(cookieName: string, subjectType: 'admin' | 'applicant') {
  const raw = (await cookies()).get(cookieName)?.value
  if (!raw) return null

  const [row] = await getDb()
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(sessions.tokenHash, hashToken(raw)),
        eq(sessions.subjectType, subjectType),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .returning()

  return row ?? null
}

export async function getAdminSession(): Promise<typeof admins.$inferSelect | null> {
  const session = await readSession(ADMIN_COOKIE, 'admin')
  if (!session?.adminId) return null

  const admin = await getDb().query.admins.findFirst({ where: eq(admins.id, session.adminId) })
  // A deactivated admin keeps their cookie but loses access immediately.
  return admin?.isActive ? admin : null
}

export async function getApplicantSession(): Promise<typeof applications.$inferSelect | null> {
  const session = await readSession(APPLICANT_COOKIE, 'applicant')
  if (!session?.applicationId) return null

  return (
    (await getDb().query.applications.findFirst({
      where: eq(applications.id, session.applicationId),
    })) ?? null
  )
}

export async function requireAdmin(): Promise<typeof admins.$inferSelect> {
  const admin = await getAdminSession()
  if (!admin) redirect('/admin/login')
  return admin
}

export async function requireApplicant(): Promise<typeof applications.$inferSelect> {
  const application = await getApplicantSession()
  if (!application) redirect('/portal')
  return application
}

async function destroy(cookieName: string): Promise<void> {
  const store = await cookies()
  const raw = store.get(cookieName)?.value
  if (raw) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)))
  }
  store.delete(cookieName)
}

export async function destroyAdminSession(): Promise<void> {
  await destroy(ADMIN_COOKIE)
}

export async function destroyApplicantSession(): Promise<void> {
  await destroy(APPLICANT_COOKIE)
}
