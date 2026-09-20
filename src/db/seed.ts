import { closeDb, getDb } from './client'
import { admins, emailTemplates, settings } from './schema'
import { DEFAULT_TERMS_TEXT } from '@/domain/settings'
import { DEFAULT_TEMPLATES } from '@/services/mail/templates'

async function main() {
  const db = getDb()

  await db
    .insert(admins)
    .values({ email: 'bala@socallinuxexpo.org', name: 'Bala', isActive: true })
    .onConflictDoNothing({ target: admins.email })

  await db
    .insert(settings)
    .values({
      id: 1,
      applicationsOpenAt: new Date('2026-09-01T00:00:00Z'),
      applicationsCloseAt: new Date('2027-01-15T23:59:59Z'),
      boothCap: 40,
      lateCancellationFeeCents: 100_000,
      termsText: DEFAULT_TERMS_TEXT,
      termsVersion: 1,
    })
    // Upsert, not insert-or-ignore: re-running the seed re-asserts the demo baseline.
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        applicationsOpenAt: new Date('2026-09-01T00:00:00Z'),
        applicationsCloseAt: new Date('2027-01-15T23:59:59Z'),
        boothCap: 40,
        lateCancellationFeeCents: 100_000,
        termsText: DEFAULT_TERMS_TEXT,
      },
    })

  for (const template of DEFAULT_TEMPLATES) {
    await db.insert(emailTemplates).values(template).onConflictDoNothing({ target: emailTemplates.key })
  }

  await closeDb()
  console.log('seeded: admin bala@socallinuxexpo.org, settings, templates')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
