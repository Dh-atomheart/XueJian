import { expect, test, type Page } from '@playwright/test'

async function warmApplication(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('app-shell')).toBeVisible()
}

test.describe('performance smoke', () => {
  test.describe.configure({ timeout: 90_000 })

  test('app shell stays interactive under 4x CPU throttling', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling via CDP is only available in Chromium')

    await warmApplication(page)

    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })

    const startedAt = Date.now()
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('app-shell')).toBeVisible()
    const shellReadyAt = Date.now()
    await page.getByTestId('sidebar-nav-library').click()
    await expect(page.getByText('文档面板')).toBeVisible()

    expect(shellReadyAt - startedAt).toBeLessThan(7000)
    expect(Date.now() - shellReadyAt).toBeLessThan(2000)
  })

  test('reader flow remains responsive under 4x CPU throttling', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling via CDP is only available in Chromium')

    await warmApplication(page)

    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await page.getByTestId('sidebar-nav-library').click()

    const startedAt = Date.now()
    await page.getByRole('button', { name: '进入阅读' }).click()
    await expect(page.getByTestId('reader-layout')).toBeVisible()
    await expect(page.getByTestId('reader-main-stage')).toBeVisible()

    await page.getByTestId('sidebar-nav-home').click()
    await expect(page.getByRole('heading', { name: '最近文档' })).toBeVisible()

    expect(Date.now() - startedAt).toBeLessThan(6000)
  })
})
