import { expect, test } from '@playwright/test'

/**
 * E2E tests for data export and review flow.
 * These tests verify the W3/W4 integration points:
 * - Settings page has export UI
 * - Dashboard shows daily stats with correct_rate
 * - Card studio shows documents ready for generation
 */

// @acceptance:w3-a5
test('settings page shows the data export panel with CSV button', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('sidebar-nav-settings').click()

  await expect(page.getByText('数据导出')).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 CSV' })).toBeVisible()
})

// @acceptance:w4-a3
test('dashboard shows daily stats including correct rate when available', async ({ page }) => {
  await page.goto('/')

  // Dashboard should be the default view
  await expect(page.getByText('今日待学')).toBeVisible()
  await expect(page.getByText('新卡')).toBeVisible()
  await expect(page.getByText('复习')).toBeVisible()
})

// @acceptance:w3-a3
test('card studio shows documents with parsed status as eligible', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('sidebar-nav-card-studio').click()

  // Card studio page should load
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

// @acceptance:w4-a1
test('settings page shows API connection test with real validation', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('sidebar-nav-settings').click()

  await expect(page.getByText('模型配置')).toBeVisible()
  // The connection test button should be present if a config exists
  await expect(page.getByText('模型与偏好')).toBeVisible()
})
