import { expect, test } from '@playwright/test'
import { gotoApp } from './support'

test('navigation includes V1.1 Knowledge and hides the remaining frozen entries', async ({
  page,
}) => {
  await gotoApp(page)

  await expect(page.getByTestId('sidebar-nav-knowledge')).toHaveCount(1)
  await expect(page.getByTestId('sidebar-nav-profile')).toHaveCount(0)
  await expect(page.getByTestId('sidebar-nav-podcast')).toHaveCount(0)
  await expect(page.getByTestId('sidebar-nav-animation')).toHaveCount(0)
  await expect(page.getByTestId('sidebar-nav-export')).toHaveCount(0)

  await page.getByTestId('sidebar-nav-library').click()
  await expect(page.getByTestId('app-shell-page-title')).toHaveText('文档库')

  await page.getByTestId('sidebar-nav-cards').click()
  await expect(page.getByTestId('app-shell-page-title')).toHaveText('卡片库')

  await page.getByTestId('sidebar-nav-learning').click()
  await expect(page.getByTestId('review-page-intro')).toBeVisible()

  await page.getByTestId('sidebar-nav-knowledge').click()
  await expect(page.getByTestId('app-shell-page-title')).toHaveText('知识问答')
  await expect(page.getByTestId('knowledge-qa-toolbar')).toBeVisible()
  await expect(page.getByPlaceholder('基于资料提问...')).toBeVisible()

  await page.getByTestId('sidebar-nav-settings').click()
  await expect(page.getByTestId('app-shell-page-title')).toHaveText('设置')
})
