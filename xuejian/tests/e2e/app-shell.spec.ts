import { expect, test } from '@playwright/test'

// @acceptance:m1-a1
test('renders the desktop shell and m1 runtime panels', async ({ page }) => {
  test.slow()

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 })

  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByRole('heading', { name: '今日学习中心' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '最近文档' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '快速开始' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '学习热力图' })).toBeVisible()
  await expect(page.getByTestId('sidebar-nav-library')).toBeVisible()
})
