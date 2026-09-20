import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
)

export const LONG = 'We are a long-running free software project with an active community. '.repeat(3)

/** Pulls the newest Mailpit message for an address and returns its text body. */
export async function latestEmailText(to: string): Promise<string> {
  const search = await fetch(
    `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
  )
  const { messages } = (await search.json()) as { messages: Array<{ ID: string }> }
  expect(messages.length).toBeGreaterThan(0)
  const detail = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`)
  const { Text } = (await detail.json()) as { Text: string }
  return Text
}

export function linkIn(text: string, path: string): string {
  const match = text.match(new RegExp(`http://localhost:3000${path}\\?token=[A-Za-z0-9_-]+`))
  expect(match, `no ${path} link in email`).not.toBeNull()
  return match![0]
}

/** A distinct source IP per call: the submission rate limiter is per-IP and
 *  in-process, so sharing one address makes repeated runs exhaust the quota. */
export function someIp(): string {
  return `198.51.100.${Math.floor(Math.random() * 250) + 1}`
}

export async function applyAs(page: Page, email: string, orgName = 'Debian') {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': someIp() })
  await page.goto('/apply')
  await page.getByLabel('Organization name').fill(orgName)
  await page.getByLabel('Contact name').fill('A Maintainer')
  await page.getByLabel('Contact email').fill(email)
  await page.getByLabel('Website').fill('debian.org')
  await page.getByLabel('Tell us about your organization').fill(LONG)
  await page.getByLabel('What will you showcase at your booth?').fill(LONG)
  await page.getByLabel('How does this advance advocacy and interest attendees?').fill(LONG)
  await page.getByLabel('How will you keep someone at the booth at all times?').fill(LONG)
  await page.getByLabel('Booth sign text').fill(orgName)
  await page.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: /submit application/i }).click()
  await expect(page.getByRole('heading', { name: /application received/i })).toBeVisible()
}

export async function enterPortal(page: Page, request: APIRequestContext, email: string) {
  await request.post('/api/dev/dispatch')
  await page.goto(linkIn(await latestEmailText(email), '/portal/enter'))
}

export async function signInAsAdmin(page: Page, request: APIRequestContext) {
  // Clear the inbox first: if the link request is ever rate limited, a stale
  // message would hand us an already-consumed token and fail confusingly.
  await fetch('http://localhost:8025/api/v1/messages', { method: 'DELETE' })
  await request.post('/api/dev/reset-limits')
  await page.goto('/admin/login')
  await page.getByLabel('Email address').fill('bala@socallinuxexpo.org')
  await page.getByRole('button', { name: /email me a sign-in link/i }).click()
  await expect(page.locator('#admin-sent')).toBeVisible()
  await request.post('/api/dev/dispatch')
  await page.goto(linkIn(await latestEmailText('bala@socallinuxexpo.org'), '/admin/enter'))
}
