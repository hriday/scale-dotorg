import { beforeEach, describe, expect, it } from 'vitest'
import { ConsoleSender } from '@/services/mail/console'

describe('ConsoleSender', () => {
  beforeEach(() => {
    ConsoleSender.sent.length = 0
  })

  it('records what it was asked to send', async () => {
    const result = await new ConsoleSender().send({
      to: 'maintainer@example.org',
      from: 'dotorgs@socallinuxexpo.org',
      subject: 'Hello',
      text: 'body',
      html: '<p>body</p>',
    })
    expect(ConsoleSender.sent).toHaveLength(1)
    expect(ConsoleSender.sent[0].to).toBe('maintainer@example.org')
    expect(result.providerMessageId).toMatch(/^console-/)
  })
})
