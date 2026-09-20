import { expect, test } from '@playwright/test'
import { latestEmailText, signInAsAdmin } from './helpers'

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.99' } })

test('the admin console is closed to anonymous visitors', async ({ page }) => {
  await page.goto('/admin/applications')
  await expect(page.getByRole('heading', { name: /community booths admin/i })).toBeVisible()
})

test('a stranger gets the same answer as a real admin', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('Email address').fill('stranger@example.org')
  await page.getByRole('button', { name: /email me a sign-in link/i }).click()
  await expect(page.locator('#admin-sent')).toContainText('If that address is an admin')
})

test('bala signs in, sees the list, and filters it', async ({ page, request }) => {
  await signInAsAdmin(page, request)

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByTestId('admin-identity')).toContainText('bala@socallinuxexpo.org')

  await page.getByRole('link', { name: 'Applications' }).click()
  await expect(page.getByRole('link', { name: 'PostgreSQL' })).toBeVisible()

  await page.goto('/admin/applications?status=confirmed')
  await expect(page.getByRole('link', { name: 'Wikimedia LA' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'PostgreSQL' })).toHaveCount(0)
})

test('an internal note never reaches the applicant', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  await page.goto('/admin/applications?status=under_review')
  await page.getByRole('link', { name: 'PostgreSQL' }).click()

  await page.getByLabel('Add an internal note').fill('Reviewer note: strong demo plan.')
  await page.getByRole('button', { name: /add note/i }).click()
  await expect(page.getByText('Reviewer note: strong demo plan.')).toBeVisible()

  // The applicant's own view must not contain it.
  await page.goto('/portal')
  await page.getByLabel('Email address').fill('contact@postgresql.org')
  await page.getByRole('button', { name: /email me a link/i }).click()
  // Wait for the action to finish before flushing, or the outbox row may not exist yet.
  await expect(page.locator('#portal-sent')).toBeVisible()
  await request.post('/api/dev/dispatch')

  const text = await latestEmailText('contact@postgresql.org')
  const link = text.match(/http:\/\/localhost:3000\/portal\/enter\?token=[A-Za-z0-9_-]+/)![0]
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'PostgreSQL', exact: true })).toBeVisible()
  await expect(page.getByText('Reviewer note')).toHaveCount(0)
})

test('an admin accepts an application and the acceptance email is queued', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  // Search by the seeded address: the portal specs leave many other Debian rows.
  await page.goto('/admin/applications?q=contact%40debian.org')
  await page.getByRole('link', { name: 'Debian', exact: true }).first().click()

  await page.getByLabel('Move to').selectOption('accepted')
  await expect(page.getByLabel('Subject')).toHaveValue(/community booth/i)
  await expect(page.getByLabel('Message')).toContainText('$1,000')

  await page.getByRole('button', { name: /apply decision/i }).click()
  await expect(page.locator('#decision-done')).toBeVisible()

  await request.post('/api/dev/dispatch')
  expect(await latestEmailText('contact@debian.org')).toContain('$1,000')
})

test('an internal move offers no email', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  await page.goto('/admin/applications?status=under_review')
  await page.getByRole('link', { name: 'PostgreSQL' }).click()

  await page.getByLabel('Move to').selectOption('waitlisted')
  await expect(page.getByLabel('Subject')).toBeVisible()

  await page.getByLabel('Move to').selectOption('submitted')
  await expect(page.getByText('This is an internal move')).toBeVisible()
})
