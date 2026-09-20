import type { EmailSender, OutgoingEmail, SendResult } from './types'

const ENDPOINT = 'https://api.smtp2go.com/v3/email/send'

export class Smtp2goSender implements EmailSender {
  constructor(private apiKey: string) {}

  async send(email: OutgoingEmail): Promise<SendResult> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': this.apiKey,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: email.from,
        to: [email.to],
        ...(email.replyTo ? { custom_headers: [{ header: 'Reply-To', value: email.replyTo }] } : {}),
        subject: email.subject,
        text_body: email.text,
        html_body: email.html,
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as {
      data?: { succeeded?: number; email_id?: string; failures?: unknown[] }
      error?: string
    }

    if (!response.ok || !payload.data?.succeeded) {
      throw new Error(
        `SMTP2GO rejected the message (HTTP ${response.status}): ${
          payload.error ?? JSON.stringify(payload.data?.failures ?? payload)
        }`,
      )
    }

    return { providerMessageId: payload.data.email_id }
  }
}
