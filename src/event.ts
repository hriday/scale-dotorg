export const TBD = 'TBD' as const

export const EVENT = {
  name: 'SCaLE 24x',
  dates: 'April 1–4, 2027',
  venue: 'Pasadena Convention Center',
  address: '300 E Green St, Pasadena, CA 91101',
  contactEmail: 'dotorgs@socallinuxexpo.org',
  /** Expo floor hours. Saturday and Sunday opening times are not yet published. */
  expoHours: [
    { day: 'Friday, April 2', opens: '1:00 pm', closes: '5:00 pm' },
    { day: 'Saturday, April 3', opens: TBD, closes: '5:00 pm' },
    { day: 'Sunday, April 4', opens: TBD, closes: '12:00 pm' },
  ],
} as const
