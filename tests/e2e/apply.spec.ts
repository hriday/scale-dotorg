import { expect, test } from '@playwright/test'

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
)

const LONG = 'We are a long-running free software project with an active community. '.repeat(3)

async function fillValidForm(page: import('@playwright/test').Page, email: string) {
  await page.getByLabel('Organization name').fill('Debian')
  await page.getByLabel('Contact name').fill('A Maintainer')
  await page.getByLabel('Contact email').fill(email)
  await page.getByLabel('Website').fill('debian.org')
  await page.getByLabel('Tell us about your organization').fill(LONG)
  await page.getByLabel('What will you showcase at your booth?').fill(LONG)
  await page.getByLabel('How does this advance advocacy and interest attendees?').fill(LONG)
  await page.getByLabel('How will you keep someone at the booth at all times?').fill(LONG)
  await page.getByLabel('Booth sign text').fill('The Debian Project')
  await page.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
}

// Each test gets its own source IP so the submission rate limiter, which is
// per-IP and in-process, does not leak state between tests.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 200) + 1}` } })

test('an organization can apply and is told to check their email', async ({ page }) => {
  await page.goto('/apply')
  await fillValidForm(page, `maintainer+${Date.now()}@example.org`)
  await page.getByRole('button', { name: /submit application/i }).click()
  await expect(page.getByRole('heading', { name: /application received/i })).toBeVisible()
})

test('a short answer is rejected with an error summary', async ({ page }) => {
  await page.goto('/apply')
  await fillValidForm(page, 'maintainer@example.org')
  await page.getByLabel('Tell us about your organization').fill('too short')
  await page.getByRole('button', { name: /submit application/i }).click()

  await expect(page.locator('#form-errors')).toContainText('Please fix the problems below.')
  await expect(page.locator('#form-errors')).toContainText('at least 100 characters')
})

test('a disguised executable is rejected as a logo', async ({ page }) => {
  await page.goto('/apply')
  await fillValidForm(page, `maintainer+exe${Date.now()}@example.org`)
  await page.getByLabel('Logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
  })
  await page.getByRole('button', { name: /submit application/i }).click()

  await expect(page.locator('#form-errors')).toContainText('PNG, JPEG, SVG, or PDF')
})
