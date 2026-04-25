import { expect, type Page } from '@playwright/test'

export async function gotoApp(page: Page) {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 20_000 })
      return
    } catch (error) {
      lastError = error

      if (attempt === 2) {
        break
      }

      await page.waitForTimeout(1_500)
    }
  }

  throw lastError
}
