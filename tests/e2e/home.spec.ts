import { expect, test } from '@playwright/test'

test('home page renders and reaches the API', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Servora HVAC' })).toBeVisible()
  await expect(page.getByTestId('api-status')).toHaveText('API: ok')
})
