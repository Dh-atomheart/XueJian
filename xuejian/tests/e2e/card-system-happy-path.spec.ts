import { expect, test, type Page } from '@playwright/test'

test.setTimeout(60_000)

async function gotoApp(page: Page) {
  await page.goto('/', { waitUntil: 'commit', timeout: 60_000 })
  await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 60_000 })
}

async function openReaderWorkbench(page: Page) {
  await gotoApp(page)

  await page.getByTestId('sidebar-nav-library').click()
  await expect(page.getByTestId('library-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'M4 Reader Mock Notes.pdf' })).toBeVisible()
  await expect(page.getByTestId('library-open-reader')).toBeEnabled()
  await page.getByTestId('library-open-reader').click()

  await expect(page.getByTestId('reader-layout')).toBeVisible()
  await expect(page.getByTestId('reader-page-nav')).toBeVisible()
  await expect(page.getByTestId('reader-context-rail')).toBeVisible()
  await expect(page.getByTestId('pdf-text-layer')).toBeVisible()
}

async function selectPdfLine(page: Page, excerpt: string) {
  const target = page
    .locator('[data-testid="pdf-text-layer"] span')
    .filter({ hasText: excerpt })
    .first()

  await expect(target).toBeVisible()

  await target.evaluate((node) => {
    const textNode = node.firstChild
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      throw new Error('Expected a text node inside the PDF text layer span')
    }

    const selection = window.getSelection()
    if (!selection) {
      throw new Error('Selection API is unavailable')
    }

    selection.removeAllRanges()

    const range = document.createRange()
    const textLength = (textNode.textContent ?? '').trimEnd().length
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.max(textLength, 1))
    selection.addRange(range)

    node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
}

test('card studio page loads from the primary navigation', async ({ page }) => {
  await gotoApp(page)

  await page.getByTestId('sidebar-nav-cards').click()
  await expect(page.getByTestId('card-studio-page')).toBeVisible()
})

test('library opens the reader workbench and keeps card-note linkage visible', async ({ page }) => {
  await openReaderWorkbench(page)
  await expect(page.getByText('为什么阅读区要保留稳定锚点？')).toBeVisible()
  await expect(page.locator('[data-testid^="highlight-"]').first()).toBeVisible()

  await page.getByRole('button', { name: '#layout' }).click()
  const highlightOpacities = await page.locator('[data-testid^="highlight-"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('fill-opacity'))
  )
  expect(highlightOpacities).toContain('0.08')
  expect(highlightOpacities).toContain('0.25')
  await page.getByRole('button', { name: '#layout' }).click()

  await page.getByText('为什么阅读区要保留稳定锚点？').click()
  await expect(page.getByTestId('reader-focus-target')).toBeVisible()

  await page.getByTestId('reader-toggle-search').click()
  await expect(page.getByTestId('reader-search-input')).toBeVisible()

  await page.getByTestId('reader-sticky-search').fill('layout')
  await expect(page.getByText('贴笺栏为什么应独立于正文？')).toBeVisible()
})

test('reader creates a card from selected text and exports annotated pdf', async ({ page }) => {
  await openReaderWorkbench(page)

  await selectPdfLine(page, 'Chunking keeps the page readable')
  await expect(page.getByTestId('reader-selection-popover')).toBeVisible()

  await page.getByRole('button', { name: '创建卡片' }).click()
  await expect(page.getByText('已创建卡片并自动绑定原文高亮。')).toBeVisible()
  await expect(page.locator('[data-testid^="highlight-"]')).toHaveCount(3)

  await page.getByTestId('reader-export-annotated-pdf').click()
  await expect(page.getByText('已导出带批注 PDF，共写入 3 处高亮。')).toBeVisible()
})

test('card study happy path reaches the completion screen', async ({ page }) => {
  await gotoApp(page)

  await expect(page.locator('main').getByRole('button', { name: '开始学习' })).toBeVisible()
  await page.locator('main').getByRole('button', { name: '开始学习' }).click()
  await expect(page.getByTestId('review-page-intro')).toBeVisible()

  const dueSummary = await page.getByText(/今日有 \d+ 张卡片等待复习/).textContent()
  const dueCount = Number(dueSummary?.match(/\d+/)?.[0] ?? '0')

  await page.getByTestId('review-page-intro').getByRole('button', { name: '开始学习' }).click()
  await expect(page.getByTestId('review-page-studying')).toBeVisible()

  for (let index = 0; index < dueCount; index += 1) {
    await page.getByTestId('review-current-card').click()
    await page.getByTestId('review-rate-good').click()
  }

  await expect(page.getByTestId('review-page-complete')).toBeVisible()
})
