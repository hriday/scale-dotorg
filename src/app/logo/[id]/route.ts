import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { uploads } from '@/db/schema'
import { getAdminSession, getApplicantSession } from '@/services/auth/session'

export const dynamic = 'force-dynamic'

export async function canSeeUpload(
  uploadId: string,
  viewer: { adminId?: string; applicationId?: string },
): Promise<boolean> {
  const upload = await getDb().query.uploads.findFirst({ where: eq(uploads.id, uploadId) })
  if (!upload) return false
  if (viewer.adminId) return true
  return Boolean(viewer.applicationId) && upload.applicationId === viewer.applicationId
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const admin = await getAdminSession()
  const applicant = admin ? null : await getApplicantSession()

  if (!(await canSeeUpload(id, { adminId: admin?.id, applicationId: applicant?.id }))) {
    return new Response('Not found', { status: 404 })
  }

  const upload = await getDb().query.uploads.findFirst({ where: eq(uploads.id, id) })
  if (!upload) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(upload.data), {
    headers: {
      'Content-Type': upload.contentType,
      'Content-Length': String(upload.byteSize),
      'Content-Disposition': `inline; filename="${upload.filename}"`,
      // Private: these bytes are access-checked, so no shared cache may hold them.
      'Cache-Control': 'private, max-age=3600',
      ETag: `"${upload.sha256}"`,
      // An uploaded SVG is sanitized, but deny scripting at the browser too.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
