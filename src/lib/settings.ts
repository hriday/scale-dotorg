import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { settings } from '@/db/schema'

export type Settings = typeof settings.$inferSelect

export async function loadSettings(): Promise<Settings> {
  const row = await getDb().query.settings.findFirst({ where: eq(settings.id, 1) })
  if (!row) {
    throw new Error('Settings row is missing. Run `npm run db:seed`.')
  }
  return row
}
