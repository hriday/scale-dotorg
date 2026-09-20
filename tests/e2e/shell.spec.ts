import { expect, test } from '@playwright/test'

test('the shell carries SCaLE branding', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('banner').getByRole('img', { name: /SCaLE/i })).toBeVisible()
  await expect(page.getByRole('contentinfo')).toContainText('socallinuxexpo.org')

  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(bodyFont).toContain('Outfit')

  const headerBg = await page.getByRole('banner').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(headerBg).toBe('rgb(34, 34, 34)')
})

test('the primary button uses the SCaLE blue', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /apply/i }).first()).toHaveCSS(
    'background-color',
    'rgb(29, 113, 240)',
  )
})
