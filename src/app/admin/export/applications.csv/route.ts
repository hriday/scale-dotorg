import { requireAdmin } from '@/services/auth/session'
import { acceptedBoothsCsv } from '@/services/export'

export const dynamic = 'force-dynamic'

export async function GET() {
  await requireAdmin()
  const csv = await acceptedBoothsCsv()
  const stamp = new Date().toISOString().slice(0, 10)

  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="community-booths-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
