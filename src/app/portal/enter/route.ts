import { redirect } from 'next/navigation'
import { createApplicantSession } from '@/services/auth/session'
import { consumeToken } from '@/services/auth/tokens'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) redirect('/portal?expired=1')

  const subject = await consumeToken(token, 'applicant_portal')
  if (!subject?.applicationId) redirect('/portal?expired=1')

  await createApplicantSession(subject.applicationId)
  redirect('/portal/application')
}
