import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { settings } from '@/db/schema'
import { DEFAULT_EXPO_HOURS } from '@/domain/settings'
import { loadSettings } from '@/lib/settings'

const db = getDb()

afterEach(async () => {
  await db
    .update(settings)
    .set({ expoHours: [...DEFAULT_EXPO_HOURS] })
    .where(eq(settings.id, 1))
})

afterAll(async () => {
  await closeDb()
})

describe('DEFAULT_EXPO_HOURS', () => {
  it('covers the three expo days', () => {
    expect(DEFAULT_EXPO_HOURS).toHaveLength(3)
    expect(DEFAULT_EXPO_HOURS.map((slot) => slot.day)).toEqual([
      'Friday, April 2',
      'Saturday, April 3',
      'Sunday, April 4',
    ])
  })

  it('states the hours we know', () => {
    expect(DEFAULT_EXPO_HOURS[0]).toMatchObject({ opens: '1:00 pm', closes: '5:00 pm' })
    expect(DEFAULT_EXPO_HOURS[1].closes).toBe('5:00 pm')
    expect(DEFAULT_EXPO_HOURS[2].closes).toBe('12:00 pm')
  })

  it('marks the two opening times nobody has published yet', () => {
    expect(DEFAULT_EXPO_HOURS[1].opens).toBe('TBD')
    expect(DEFAULT_EXPO_HOURS[2].opens).toBe('TBD')
  })
})

describe('settings.expoHours', () => {
  it('is seeded with the defaults', async () => {
    const loaded = await loadSettings()
    expect(loaded.expoHours).toEqual(DEFAULT_EXPO_HOURS)
  })

  it('is what an admin edits, not a constant in the code', async () => {
    await db
      .update(settings)
      .set({
        expoHours: [
          { day: 'Friday, April 2', opens: '1:00 pm', closes: '5:00 pm' },
          { day: 'Saturday, April 3', opens: '9:30 am', closes: '5:00 pm' },
          { day: 'Sunday, April 4', opens: '10:00 am', closes: '12:00 pm' },
        ],
      })
      .where(eq(settings.id, 1))

    const loaded = await loadSettings()
    expect(loaded.expoHours[1].opens).toBe('9:30 am')
    expect(loaded.expoHours[2].opens).toBe('10:00 am')
    expect(loaded.expoHours.some((slot) => slot.opens === 'TBD')).toBe(false)
  })
})
