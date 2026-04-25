import { expect, test } from '@playwright/test'
import { gotoApp } from './support'

test.setTimeout(60_000)

test('card studio page loads from the primary navigation', async ({ page }) => {
  await gotoApp(page)

  await page.getByTestId('sidebar-nav-cards').click()
  await expect(page.getByTestId('card-studio-page')).toBeVisible()
  await expect(page.getByTestId('card-studio-start-generation')).toBeVisible()
  await expect(page.getByTestId('card-studio-run-list')).toBeVisible()
  await expect(page.getByTestId('card-studio-card-list')).toBeVisible()
})

test('candidate review can finalize accepted cards into the study set', async ({ page }) => {
  await gotoApp(page)

  await page.getByTestId('sidebar-nav-cards').click()
  await expect(page.getByTestId('card-studio-candidate-review')).toBeVisible()
  await expect(page.getByTestId('card-candidate-panel')).toBeVisible()

  await page.getByTestId('card-candidate-accept-12121212-1212-4212-8212-121212121212').click()
  await page.getByTestId('card-candidate-reject-34343434-3434-4434-8434-343434343434').click()
  await expect(page.getByTestId('card-studio-pending-count')).toContainText('0')

  await page.getByTestId('card-studio-finalize-generation').click()

  await expect(page.getByTestId('card-studio-finalize-summary')).toBeVisible()
  await expect(
    page.getByTestId('card-studio-card-list').locator('[data-testid^="card-studio-card-"]')
  ).toHaveCount(3)
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
