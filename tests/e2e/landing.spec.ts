import { expect, test } from '@playwright/test'

test('the landing page explains the program and the terms', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Community Booths')
  await expect(page.getByText('April 1–4, 2027').first()).toBeVisible()
  await expect(page.getByText('Pasadena Convention Center').first()).toBeVisible()

  await expect(page.getByRole('heading', { name: /what scale provides/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /what we ask/i })).toBeVisible()

  await expect(page.getByText('tell us as early as you can').first()).toBeVisible()
  await expect(page.getByText(/empty booth on the floor/i).first()).toBeVisible()

  await expect(page.getByText('Friday, April 2')).toBeVisible()
  await expect(page.getByText('1:00 pm')).toBeVisible()
  await expect(page.getByText('TBD').first()).toBeVisible()

  await expect(page.getByRole('link', { name: /apply for a booth/i }).first()).toBeVisible()
})
