import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('app-shell')).toBeVisible()
  await page.getByTestId('sidebar-nav-library').click()
  await page.getByRole('button', { name: '进入阅读' }).click()
})

// @acceptance:m4-a1
// @acceptance:m4-a3
test('shows the reader surface with a persistent context rail for the current page', async ({ page }) => {
  await expect(page.getByTestId('reader-layout')).toBeVisible()
  await expect(page.getByTestId('reader-main-stage')).toBeVisible()
  await expect(page.getByTestId('reader-context-rail')).toBeVisible()
  await expect(page.getByRole('button', { name: '文档库', exact: true })).toBeVisible()
  await expect(page.getByText('当前页贴笺')).toBeVisible()
  await expect(page.getByText('为什么阅读区要保留稳定锚点？')).toBeVisible()
})

// @acceptance:m4-a2
test('navigates between sticky notes and source highlights in both directions', async ({ page }) => {
  await page.getByTestId('sticky-card-33333333-3333-4333-8333-333333333333').click()
  await expect(page.getByTestId('reader-focus-target')).toBeVisible()

  await page.getByTestId('highlight-77777777-7777-4777-8777-777777777777').click()
  await expect(page.getByText('已在右侧定位对应贴笺。')).toBeVisible()
  await expect(page.getByTestId('sticky-card-33333333-3333-4333-8333-333333333333')).toBeVisible()
})

// @acceptance:v4-4-a3
test('allows leaving the reader through the sidebar navigation rail', async ({ page }) => {
  await page.getByTestId('sidebar-nav-home').click()

  await expect(page.getByTestId('reader-layout')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '今日学习中心' })).toBeVisible()
})