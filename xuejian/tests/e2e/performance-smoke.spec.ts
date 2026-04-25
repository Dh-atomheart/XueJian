import { expect, test, type Page } from '@playwright/test'
import { gotoApp } from './support'

async function warmApplication(page: Page) {
  await gotoApp(page)
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
    await expect(page.getByTestId('library-open-reader')).toBeVisible()

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
    await page.getByTestId('library-open-reader').click()
    await expect(page.getByTestId('reader-layout')).toBeVisible()
    await expect(page.getByTestId('reader-main-stage')).toBeVisible()

    await page.getByTestId('reader-close').click()
    await expect(page.getByTestId('library-open-reader')).toBeVisible()

    expect(Date.now() - startedAt).toBeLessThan(6000)
  })
})
