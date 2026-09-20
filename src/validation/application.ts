import { z } from 'zod'
import { normalizeEmail } from '@/lib/email'

export const LIMITS = {
  longTextMin: 100,
  longTextMax: 2000,
  signTextMax: 60,
  logoBytesMax: 2_097_152,
} as const

const longText = (label: string) =>
  z
    .string()
    .trim()
    .min(LIMITS.longTextMin, `${label} needs at least ${LIMITS.longTextMin} characters`)
    .max(LIMITS.longTextMax, `${label} must be under ${LIMITS.longTextMax} characters`)

const website = z
  .string()
  .trim()
  .min(1, 'Website is required')
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .refine((value) => {
    try {
      const url = new URL(value)
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')
    } catch {
      return false
    }
  }, 'Enter a valid website address')

export const applicationInputSchema = z.object({
  orgName: z.string().trim().min(2, 'Organization name is required').max(120),
  contactName: z.string().trim().min(2, 'Contact name is required').max(120),
  contactEmail: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .transform(normalizeEmail)
    .pipe(z.email('Enter a valid email address')),
  website,
  about: longText('The write-up about your organization'),
  showcase: longText('What you plan to showcase'),
  communityImpact: longText('How this advances advocacy and interests attendees'),
  staffingPlan: longText('Your staffing plan'),
  signText: z
    .string()
    .trim()
    .min(1, 'Sign text is required')
    .max(LIMITS.signTextMax, `Sign text must be ${LIMITS.signTextMax} characters or fewer`),
})

export type ApplicationInput = z.infer<typeof applicationInputSchema>
