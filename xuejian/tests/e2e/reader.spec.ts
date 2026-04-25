import { expect, test } from '@playwright/test'
import { gotoApp } from './support'

test.setTimeout(60_000)

test.beforeEach(async ({ page }) => {
  await gotoApp(page)
  await page.getByTestId('sidebar-nav-library').click()
  await page.getByTestId('library-open-reader').click()
  await expect(page.getByTestId('highlight-77777777-7777-4777-8777-777777777777')).toBeVisible({
    timeout: 15_000,
  })
})

// @acceptance:m4-a1
// @acceptance:m4-a3
test('shows the reader surface with a persistent context rail for the current page', async ({
  page,
}) => {
  await expect(page.getByTestId('reader-layout')).toBeVisible()
  await expect(page.getByTestId('reader-main-stage')).toBeVisible()
  await expect(page.getByTestId('reader-context-rail')).toBeVisible()
  await expect(page.getByTestId('reader-excerpt-panel')).toHaveCount(0)
  await expect(page.getByTestId('reader-sticky-search')).toBeVisible()
  await expect(page.getByTestId('reader-close')).toBeVisible()
})

// @acceptance:m4-a2
test('navigates between sticky notes and source highlights in both directions', async ({ page }) => {
  await page.getByTestId('sticky-card-33333333-3333-4333-8333-333333333333').click()
  await expect(page.getByTestId('reader-focus-target')).toBeVisible({ timeout: 15_000 })

  await page.getByTestId('highlight-77777777-7777-4777-8777-777777777777').click()
  await expect(page.getByTestId('reader-focus-target')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('sticky-card-33333333-3333-4333-8333-333333333333')).toBeVisible()
})

// @acceptance:v4-4-a3
test('allows leaving the reader through the toolbar close action', async ({ page }) => {
  await page.getByTestId('reader-close').click()

  await expect(page.getByTestId('reader-layout')).toHaveCount(0)
  await expect(page.getByTestId('library-open-reader')).toBeVisible()
})
