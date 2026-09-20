import nodemailer, { type Transporter } from 'nodemailer'
import type { EmailSender, OutgoingEmail, SendResult } from './types'

export class SmtpSender implements EmailSender {
  private transport: Transporter

  constructor(host: string, port: number) {
    this.transport = nodemailer.createTransport({ host, port, secure: false, ignoreTLS: true })
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const info = await this.transport.sendMail({
      to: email.to,
      from: email.from,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
    })
    return { providerMessageId: info.messageId }
  }
}
