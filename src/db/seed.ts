import './load-env'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from './client'
import { admins, applications, emailTemplates, settings } from './schema'
import { DEFAULT_EXPO_HOURS, DEFAULT_TERMS_TEXT } from '@/domain/settings'
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
      expoHours: [...DEFAULT_EXPO_HOURS],
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
        expoHours: [...DEFAULT_EXPO_HOURS],
      },
    })

  for (const template of DEFAULT_TEMPLATES) {
    await db.insert(emailTemplates).values(template).onConflictDoNothing({ target: emailTemplates.key })
  }


  // Demo fixtures only. Production must never get fake organizations, so they
  // are skipped unless explicitly asked for.
  const wantSamples =
    process.env.SEED_SAMPLES === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.SEED_SAMPLES !== 'false')

  if (!wantSamples) {
    await closeDb()
    console.log('seeded: admin bala@socallinuxexpo.org, settings, templates (no sample data)')
    return
  }

  const SAMPLES = [
    ['Debian', 'debian.org', 'submitted'],
    ['PostgreSQL', 'postgresql.org', 'under_review'],
    ['Electronic Frontier Foundation', 'eff.org', 'accepted'],
    ['Wikimedia LA', 'wikimedia.org', 'confirmed'],
    ['Home Assistant', 'home-assistant.io', 'waitlisted'],
    ['KDE', 'kde.org', 'info_requested'],
    ['A Very Small Project', 'example.org', 'rejected'],
  ] as const

  const filler = (sentence: string) => `${sentence} `.repeat(4).trim()

  for (const [orgName, domain, status] of SAMPLES) {
    const contactEmail = `contact@${domain}`
    const existing = await db.query.applications.findFirst({
      where: eq(applications.contactEmail, contactEmail),
    })

    const confirmedBits =
      status === 'confirmed'
        ? {
            confirmedAt: new Date(),
            confirmedByName: `${orgName} booth lead`,
            confirmedTermsSnapshot: DEFAULT_TERMS_TEXT,
            confirmedTermsVersion: 1,
          }
        : {
            confirmedAt: null,
            confirmedByName: null,
            confirmedTermsSnapshot: null,
            confirmedTermsVersion: null,
          }

    if (existing) {
      // Reset the demo fixture: the decision tests move these statuses, and
      // re-seeding must put them back or the suite only passes once.
      await db
        .update(applications)
        .set({
          status,
          boothNumber: status === 'confirmed' ? '412' : null,
          decidedAt: null,
          decidedBy: null,
          ...confirmedBits,
        })
        .where(eq(applications.id, existing.id))
      continue
    }

    await db.insert(applications).values({
      orgName,
      contactName: `${orgName} booth lead`,
      contactEmail,
      website: `https://${domain}`,
      about: filler(`${orgName} is a long-running free software community with active contributors worldwide.`),
      showcase: filler('We will run live demos on donated hardware and answer questions at the booth all weekend.'),
      communityImpact: filler('Attendees meet maintainers face to face and learn how small a first contribution really is.'),
      staffingPlan: filler('Six local volunteers on a published two-hour rota covering every hour the floor is open.'),
      signText: orgName.slice(0, 60),
      status,
      boothNumber: status === 'confirmed' ? '412' : null,
      ...confirmedBits,
    })
  }

  await closeDb()
  console.log('seeded: admin bala@socallinuxexpo.org, settings, templates, sample applications')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
