import { expect, test } from '@playwright/test'
import { gotoApp } from './support'

test.setTimeout(60_000)

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoApp(page)
  await page.getByTestId('sidebar-nav-library').click()
  await page.getByTestId('library-open-reader').click()
  await expect(page.getByTestId('highlight-77777777-7777-4777-8777-777777777777')).toBeVisible({
    timeout: 15_000,
  })
})

// @acceptance:m4-a1
// @acceptance:m4-a3
test('shows the reader surface with a current-page card panel', async ({ page }) => {
  await expect(page.getByTestId('reader-layout')).toBeVisible()
  await expect(page.getByTestId('reader-main-stage')).toBeVisible()
  await expect(page.getByTestId('reader-card-panel')).toBeVisible()
  await expect(page.getByTestId('reader-excerpt-panel')).toHaveCount(0)
  await expect(page.getByTestId('reader-sticky-search')).toHaveCount(0)
  await expect(page.getByTestId('reader-card-33333333-3333-4333-8333-333333333333')).toBeVisible()
  await expect(page.getByTestId('reader-card-panel')).toContainText('P.1')
  await expect(page.getByTestId('reader-card-panel')).toContainText(
    "Chunking keeps the page readable while stable anchors hold the user's place."
  )
  await expect(page.getByTestId('reader-close')).toBeVisible()
})

// @acceptance:m4-a2
test('navigates between current-page cards and source highlights in both directions', async ({
  page,
}) => {
  await page.getByTestId('reader-card-33333333-3333-4333-8333-333333333333').click()
  await expect(page.getByTestId('reader-focus-target')).toBeVisible({ timeout: 15_000 })

  await page.getByTestId('highlight-77777777-7777-4777-8777-777777777777').click()
  await expect(page.getByTestId('reader-focus-target')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('reader-card-33333333-3333-4333-8333-333333333333')).toBeVisible()
})

test('shows an empty state when the current page has no cards', async ({ page }) => {
  await page.locator('[data-testid="reader-layout"] button').nth(2).click()

  await expect(page.getByTestId('reader-card-panel')).toBeVisible()
  await expect(page.getByTestId('reader-card-panel-empty')).toBeVisible()
  await expect(page.getByTestId('reader-card-panel')).toContainText('第 2 页 · 0 张卡片')
})

// @acceptance:v4-4-a3
test('allows leaving the reader through the toolbar close action', async ({ page }) => {
  await page.getByTestId('reader-close').click()

  await expect(page.getByTestId('reader-layout')).toHaveCount(0)
  await expect(page.getByTestId('library-open-reader')).toBeVisible()
})
