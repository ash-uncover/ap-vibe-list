import { test, expect } from '@playwright/test'
import { enterDemoWithData } from './helpers'

test.describe('smoke', () => {
  test('shows the login screen when unauthenticated', async ({ page }) => {
    await page.goto('')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: /demo mode/i })).toBeVisible()
  })

  test('demo mode enters the app and the bottom nav works', async ({ page }) => {
    await enterDemoWithData(page)

    await page.getByRole('link', { name: 'Items' }).click()
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible()

    await page.getByRole('link', { name: 'Recipes' }).click()
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible()

    await page.getByRole('link', { name: 'Lists' }).click()
    await expect(page.getByRole('heading', { name: 'Lists' })).toBeVisible()
  })
})
