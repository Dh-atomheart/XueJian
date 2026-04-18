import { expect, test } from '@playwright/test'

// @acceptance:m1-a1
test('renders the desktop shell and m1 runtime panels', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '学笺' })).toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'Import PDFs, stabilize anchors, then promote them into reviewable cards.',
    })
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Host boundary' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent runs' })).toBeVisible()
  await expect(page.getByText('上传 PDF 文档')).toBeVisible()
})
