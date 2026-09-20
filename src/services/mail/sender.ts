import { getEnv } from '@/env'
import { ConsoleSender } from './console'
import { SmtpSender } from './smtp'
import { Smtp2goSender } from './smtp2go'
import type { EmailSender } from './types'

export type { EmailSender, OutgoingEmail, SendResult } from './types'

let cached: EmailSender | undefined

export function getSender(): EmailSender {
  if (cached) return cached
  const env = getEnv()
  switch (env.EMAIL_SENDER) {
    case 'console':
      cached = new ConsoleSender()
      break
    case 'smtp':
      cached = new SmtpSender(env.SMTP_HOST!, env.SMTP_PORT ?? 1025)
      break
    case 'smtp2go':
      cached = new Smtp2goSender(env.SMTP2GO_API_KEY!)
      break
  }
  return cached!
}

export function resetSender(): void {
  cached = undefined
}
