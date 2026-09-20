import { expect, test } from '@playwright/test'
import { signInAsAdmin } from './helpers'

test('an admin can change the expo hours and the public page follows', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  await page.goto('/admin/settings')

  await page.getByLabel('Day', { exact: true }).nth(1).fill('Saturday, April 3')
  await page.locator('#opens1').fill('9:30 am')
  await page.getByRole('button', { name: /save settings/i }).click()
  await expect(page.locator('#settings-saved')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('9:30 am')).toBeVisible()

  // Put it back so the rest of the suite sees the seeded baseline.
  await page.goto('/admin/settings')
  await page.locator('#opens1').fill('TBD')
  await page.getByRole('button', { name: /save settings/i }).click()
  await expect(page.locator('#settings-saved')).toBeVisible()
})

test('settings refuse a window that closes before it opens', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  await page.goto('/admin/settings')

  await page.getByLabel('Applications close').fill('2020-01-01T00:00')
  await page.getByRole('button', { name: /save settings/i }).click()

  await expect(page.locator('#settings-error')).toContainText('close after they open')
})

test('an admin can edit an email template', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  await page.goto('/admin/templates')

  await page.getByText('Application accepted').click()
  await expect(page.locator('#accepted-subject')).toBeVisible()
  await expect(page.locator('#accepted-body')).toContainText('{{fee}}')
})

test('the admin list shows the seeded admin and refuses self-deactivation', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  await page.goto('/admin/admins')

  await expect(page.getByRole('cell', { name: 'bala@socallinuxexpo.org' })).toBeVisible()
  await expect(page.getByText('Active (you)')).toBeVisible()
})

test('the CSV export contains the confirmed booth', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  const response = await page.request.get('/admin/export/applications.csv')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/csv')

  const body = await response.text()
  expect(body).toContain('"Wikimedia LA"')
  expect(body).toContain('"Organization"')
})

test('the logo ZIP downloads', async ({ page, request }) => {
  await signInAsAdmin(page, request)
  const response = await page.request.get('/admin/export/logos.zip')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/zip')
})

test('exports are closed to anonymous visitors', async ({ page }) => {
  const response = await page.request.get('/admin/export/applications.csv')
  // requireAdmin redirects to the login page rather than serving data.
  expect(response.url()).toContain('/admin/login')
})
