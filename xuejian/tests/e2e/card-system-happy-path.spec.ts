import { expect, test, type Page } from '@playwright/test'

test.setTimeout(60_000)

async function gotoApp(page: Page) {
  await page.goto('/', { waitUntil: 'commit', timeout: 60_000 })
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 60_000 })
}

test('card studio page loads from the primary navigation', async ({ page }) => {
  await gotoApp(page)

  await page.getByTestId('sidebar-nav-cards').click()
  await expect(page.getByTestId('card-studio-page')).toBeVisible()
  await expect(page.getByTestId('card-studio-start-generation')).toBeVisible()
  await expect(page.getByTestId('card-studio-candidate-list')).toBeVisible()
  await expect(page.getByTestId('card-studio-run-list')).toBeVisible()
})

test('card review happy path reaches the completion screen', async ({ page }) => {
  await gotoApp(page)

  await page.getByTestId('sidebar-nav-learning').click()
  await expect(page.getByTestId('review-page-intro')).toBeVisible()
  await expect(page.getByTestId('review-start-session')).toBeVisible()

  await page.getByTestId('review-start-session').click()
  await expect(page.getByTestId('review-page-studying')).toBeVisible()

  for (let index = 0; index < 10; index += 1) {
    if (await page.getByTestId('review-page-complete').isVisible().catch(() => false)) {
      break
    }

    await page.getByTestId('review-current-card').click()
    await page.getByTestId('review-rate-good').click()
  }

  await expect(page.getByTestId('review-page-complete')).toBeVisible()
})
