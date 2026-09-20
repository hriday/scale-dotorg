import { z } from 'zod'

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    PUBLIC_BASE_URL: z.url(),
    MAIL_FROM: z.email(),
    EMAIL_SENDER: z.enum(['console', 'smtp', 'smtp2go']),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP2GO_API_KEY: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.EMAIL_SENDER === 'smtp2go' && !value.SMTP2GO_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP2GO_API_KEY'],
        message: 'SMTP2GO_API_KEY is required when EMAIL_SENDER=smtp2go',
      })
    }
    if (value.EMAIL_SENDER === 'smtp' && !value.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_SENDER=smtp',
      })
    }
  })

export type Env = z.infer<typeof schema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid environment: ${detail}`)
  }
  return result.data
}

let cached: Env | undefined

export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
