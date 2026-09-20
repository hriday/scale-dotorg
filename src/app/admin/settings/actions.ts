'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { auditLog, settings, type ExpoHours } from '@/db/schema'
import { requireAdmin } from '@/services/auth/session'

export interface SettingsState {
  error?: string
  saved?: boolean
}

function parseDate(value: string, label: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is not a valid date.`)
  return parsed
}

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin()
  const db = getDb()

  try {
    const openAt = parseDate(String(formData.get('applicationsOpenAt') ?? ''), 'The opening date')
    const closeAt = parseDate(String(formData.get('applicationsCloseAt') ?? ''), 'The closing date')
    if (closeAt <= openAt) throw new Error('Applications must close after they open.')

    const boothCap = Number(formData.get('boothCap'))
    if (!Number.isInteger(boothCap) || boothCap < 0) throw new Error('Booth cap must be a whole number.')

    const feeDollars = Number(formData.get('feeDollars'))
    if (!Number.isFinite(feeDollars) || feeDollars < 0) throw new Error('The fee must be a number.')

    const termsText = String(formData.get('termsText') ?? '').trim()
    if (termsText.length < 20) throw new Error('The terms text cannot be empty.')

    const expoHours: ExpoHours = []
    for (let i = 0; i < 3; i += 1) {
      const day = String(formData.get(`day${i}`) ?? '').trim()
      if (!day) continue
      expoHours.push({
        day,
        opens: String(formData.get(`opens${i}`) ?? '').trim() || 'TBD',
        closes: String(formData.get(`closes${i}`) ?? '').trim() || 'TBD',
      })
    }

    const current = await db.query.settings.findFirst({ where: eq(settings.id, 1) })
    if (!current) throw new Error('Settings row is missing.')

    // Editing the terms bumps the version; confirmations keep their snapshot of
    // whatever text was in force when they agreed.
    const termsChanged = termsText !== current.termsText

    await db.transaction(async (tx) => {
      await tx
        .update(settings)
        .set({
          applicationsOpenAt: openAt,
          applicationsCloseAt: closeAt,
          boothCap,
          lateCancellationFeeCents: Math.round(feeDollars * 100),
          termsText,
          termsVersion: termsChanged ? current.termsVersion + 1 : current.termsVersion,
          expoHours,
          updatedAt: new Date(),
          updatedBy: admin.id,
        })
        .where(eq(settings.id, 1))

      await tx.insert(auditLog).values({
        actorType: 'admin',
        actorId: admin.id,
        action: 'settings.updated',
        detail: { termsChanged, boothCap, feeDollars },
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Those settings were refused.' }
  }

  revalidatePath('/admin/settings')
  revalidatePath('/')
  return { saved: true }
}
