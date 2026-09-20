import { inArray } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications } from '@/db/schema'
import { STATUS_LABELS, type Status } from '@/domain/status'

/** Statuses that represent a booth SCaLE has actually committed to. */
export const EXPORTABLE: Status[] = ['accepted', 'confirmed']

const COLUMNS = [
  'Organization',
  'Contact name',
  'Contact email',
  'Website',
  'Booth number',
  'Sign text',
  'Status',
  'Confirmed at',
  'Confirmed by',
] as const

/**
 * Quotes a CSV field. A leading =, +, - or @ is prefixed with a single quote so
 * a spreadsheet treats it as text rather than a formula.
 */
export function csvCell(value: string | null | undefined): string {
  const raw = value ?? ''
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${guarded.replace(/"/g, '""')}"`
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export async function acceptedBoothsCsv(): Promise<string> {
  const rows = await getDb()
    .select()
    .from(applications)
    .where(inArray(applications.status, EXPORTABLE))
    .orderBy(applications.orgName)

  const body = rows.map((row) => [
    row.orgName,
    row.contactName,
    row.contactEmail,
    row.website,
    row.boothNumber ?? '',
    row.signText,
    STATUS_LABELS[row.status as Status],
    row.confirmedAt ? row.confirmedAt.toISOString() : '',
    row.confirmedByName ?? '',
  ])

  return toCsv([[...COLUMNS], ...body])
}

/** A filesystem-safe slug for naming a logo file after its organization. */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'organization'
  )
}
