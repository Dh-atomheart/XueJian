import { expect, test } from '@playwright/test'

// @acceptance:m1-a1
test('renders the desktop shell and m1 runtime panels', async ({ page }) => {
  test.slow()

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })

  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByTestId('app-shell-page-title')).toBeVisible()
  await expect(page.getByTestId('home-recent-documents-panel')).toBeVisible()
  await expect(page.getByTestId('home-quick-actions-panel')).toBeVisible()
  await expect(page.getByTestId('home-heatmap-panel')).toBeVisible()
  await expect(page.getByTestId('sidebar-nav-library')).toBeVisible()
})
