import { expect, test } from '@playwright/test'

test('renders the desktop shell and m1 runtime panels', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '欢迎使用学笺' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Host 边界' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '最近工作流' })).toBeVisible()
  await expect(page.getByText('上传 PDF 文档')).toBeVisible()
})
