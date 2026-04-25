import { expect, test } from '@playwright/test'
import { gotoApp } from './support'

// @acceptance:m1-a1
test('renders the desktop shell and current home panels', async ({ page }) => {
  test.slow()

  await gotoApp(page)

  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByTestId('app-shell-page-title')).toBeVisible()
  await expect(page.getByTestId('home-recent-documents-panel')).toBeVisible()
  await expect(page.getByTestId('home-quick-actions-panel')).toBeVisible()
  await expect(page.getByTestId('home-heatmap-panel')).toBeVisible()
  await expect(page.getByTestId('sidebar-nav-library')).toBeVisible()
})
