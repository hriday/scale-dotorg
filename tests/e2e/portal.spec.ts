import { expect, test } from '@playwright/test'
import { applyAs, enterPortal } from './helpers'

test('an applicant reaches their application from the receipt email', async ({ page, request }) => {
  const email = `maintainer+portal${Date.now()}@example.org`
  await applyAs(page, email)
  await enterPortal(page, request, email)

  await expect(page.getByRole('heading', { name: 'Debian', exact: true })).toBeVisible()
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible()
})

test('the portal does not reveal whether an address has an application', async ({ page }) => {
  await page.goto('/portal')
  await page.getByLabel('Email address').fill('definitely-nobody@example.org')
  await page.getByRole('button', { name: /email me a link/i }).click()
  await expect(page.locator('#portal-sent')).toContainText('If we have an application')
})

test('a used link cannot be used twice', async ({ page, request }) => {
  const email = `maintainer+once${Date.now()}@example.org`
  await applyAs(page, email)
  await enterPortal(page, request, email)
  await expect(page.getByRole('heading', { name: 'Debian', exact: true })).toBeVisible()

  const link = page.url()
  await page.context().clearCookies()
  await page.goto(link)
  await expect(page.getByRole('heading', { name: /your booth application/i })).toBeVisible()
})

test('an applicant can correct their answers and then withdraw', async ({ page, request }) => {
  const email = `maintainer+edit${Date.now()}@example.org`
  await applyAs(page, email)
  await enterPortal(page, request, email)

  await page.getByLabel('Booth sign text').fill('The Debian Project')
  await page.getByRole('button', { name: /save changes/i }).click()
  await expect(page.locator('#edit-saved')).toBeVisible()

  await page.getByRole('button', { name: /withdraw this application/i }).click()
  await expect(page.getByRole('heading', { name: /your booth application/i })).toBeVisible()
})
