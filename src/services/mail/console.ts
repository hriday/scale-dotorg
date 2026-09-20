import { randomUUID } from 'node:crypto'
import type { EmailSender, OutgoingEmail, SendResult } from './types'

export class ConsoleSender implements EmailSender {
  static sent: OutgoingEmail[] = []

  async send(email: OutgoingEmail): Promise<SendResult> {
    ConsoleSender.sent.push(email)
    console.log(`\n--- email to ${email.to} ---\n${email.subject}\n\n${email.text}\n---\n`)
    return { providerMessageId: `console-${randomUUID()}` }
  }
}
