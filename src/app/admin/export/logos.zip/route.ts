import JSZip from 'jszip'
import { inArray } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications } from '@/db/schema'
import { requireAdmin } from '@/services/auth/session'
import { EXPORTABLE, slugify } from '@/services/export'

export const dynamic = 'force-dynamic'

const EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
}

export async function GET() {
  await requireAdmin()
  const db = getDb()

  const rows = await db
    .select()
    .from(applications)
    .where(inArray(applications.status, EXPORTABLE))
    .orderBy(applications.orgName)

  const zip = new JSZip()
  const used = new Set<string>()

  for (const row of rows) {
    if (!row.logoUploadId) continue
    const upload = await db.query.uploads.findFirst({
      where: (u, { eq }) => eq(u.id, row.logoUploadId!),
    })
    if (!upload) continue

    const booth = row.boothNumber ? `-${slugify(row.boothNumber)}` : ''
    const base = `${slugify(row.orgName)}${booth}`
    let name = `${base}.${EXTENSION[upload.contentType] ?? 'bin'}`
    // Two organizations can slug to the same name; never silently drop one.
    let suffix = 2
    while (used.has(name)) {
      name = `${base}-${suffix++}.${EXTENSION[upload.contentType] ?? 'bin'}`
    }
    used.add(name)

    zip.file(name, Buffer.from(upload.data))
  }

  const body = await zip.generateAsync({ type: 'nodebuffer' })
  const stamp = new Date().toISOString().slice(0, 10)

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="community-booth-logos-${stamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
