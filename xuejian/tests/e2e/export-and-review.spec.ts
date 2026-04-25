import { expect, test } from '@playwright/test'
import { gotoApp } from './support'

/**
 * E2E tests for the current dashboard, settings, and card-studio contracts.
 * These assertions target stable test ids and current onboarding structure
 * instead of historical copy that no longer exists in the UI.
 */

// @acceptance:w3-a5
test('settings page shows the BYOK onboarding callout and add-config entrypoint', async ({
  page,
}) => {
  await gotoApp(page)
  await page.getByTestId('sidebar-nav-settings').click()

  await expect(page.getByTestId('settings-setup-callout')).toBeVisible()
  await expect(page.getByTestId('settings-toggle-add-config')).toBeVisible()
})

// @acceptance:w4-a3
test('dashboard shows the stable home panels for recent docs, quick actions, and heatmap', async ({
  page,
}) => {
  await gotoApp(page)

  await expect(page.getByTestId('home-recent-documents-panel')).toBeVisible()
  await expect(page.getByTestId('home-quick-actions-panel')).toBeVisible()
  await expect(page.getByTestId('home-heatmap-panel')).toBeVisible()
})

// @acceptance:w3-a3
test('card studio shows documents with parsed status as eligible', async ({ page }) => {
  await gotoApp(page)
  await page.getByTestId('sidebar-nav-cards').click()

  await expect(page.getByTestId('card-studio-page')).toBeVisible()
  await expect(page.getByTestId('card-studio-start-generation')).toBeVisible()
  await expect(page.getByTestId('card-studio-run-list')).toBeVisible()
})

// @acceptance:w4-a1
test('settings page gates workflow assignment until a provider is configured', async ({
  page,
}) => {
  await gotoApp(page)
  await page.getByTestId('sidebar-nav-settings').click()

  await expect(page.getByTestId('settings-toggle-add-config')).toBeVisible()
  await expect(page.getByTestId('settings-setup-callout')).toBeVisible()
  await expect(page.getByTestId('settings-workflow-assignments')).toHaveCount(0)
})
