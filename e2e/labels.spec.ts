import { test, expect } from '@playwright/test'
import { enterDemoWithData } from './helpers'

/** Two ingredients sharing a label, plus one on its own — enough to exercise counts/merge. */
function seed() {
  return {
    labels: [
      { id: 'veg', name: 'Vegetables' },
      { id: 'fresh', name: 'Fresh' },
    ],
    ingredients: [
      { id: 'a1', name: 'Tomato', defaultUnit: 'piece', labelIds: ['veg', 'fresh'] },
      { id: 'a2', name: 'Carrot', defaultUnit: 'piece', labelIds: ['veg'] },
    ],
  }
}

test.describe('label management', () => {
  test('reached from the Items page and lists labels with usage counts', async ({ page }) => {
    await enterDemoWithData(page, seed())

    await page.goto('ingredients')
    await page.getByRole('link', { name: 'Manage labels' }).click()
    await expect(page).toHaveURL(/\/ingredients\/labels$/)

    const veg = page.locator('.rows__item', { hasText: 'Vegetables' })
    const fresh = page.locator('.rows__item', { hasText: 'Fresh' })
    await expect(veg).toContainText('2 items')
    await expect(fresh).toContainText('1 item')
  })

  test('renaming a label propagates to every ingredient', async ({ page }) => {
    await enterDemoWithData(page, seed())
    await page.goto('ingredients/labels')

    const fresh = page.locator('.rows__item', { hasText: 'Fresh' })
    await fresh.getByRole('button', { name: 'Rename' }).click()
    // Once editing, the row's visible "Fresh" text becomes an input, so address it directly.
    await page.locator('input.rows__main').fill('Chilled')
    await page.getByRole('button', { name: 'Save' }).click()

    // No ingredient edit needed — the chip updates because ingredients reference by id.
    await page.goto('ingredients')
    await expect(page.getByRole('link', { name: /Tomato/ })).toContainText('Chilled')
    await expect(page.getByRole('link', { name: /Tomato/ })).not.toContainText('Fresh')
  })

  test('merging a label re-points ingredients and removes the source', async ({ page }) => {
    await enterDemoWithData(page, seed())
    await page.goto('ingredients/labels')
    page.on('dialog', (d) => d.accept())

    const fresh = page.locator('.rows__item', { hasText: 'Fresh' })
    await fresh.getByRole('button', { name: 'Merge' }).click()
    await fresh.locator('select').selectOption({ label: 'Vegetables' })

    await expect(page.locator('.rows__item', { hasText: 'Fresh' })).toHaveCount(0)
    await page.goto('ingredients')
    // Tomato had both; after merge it keeps a single Vegetables chip.
    await expect(page.getByRole('link', { name: /Tomato/ })).toContainText('Vegetables')
    await expect(page.getByRole('link', { name: /Tomato/ })).not.toContainText('Fresh')
  })

  test('deleting a label strips it from every ingredient', async ({ page }) => {
    await enterDemoWithData(page, seed())
    await page.goto('ingredients/labels')
    page.on('dialog', (d) => d.accept())

    const veg = page.locator('.rows__item', { hasText: 'Vegetables' })
    await veg.getByRole('button', { name: 'Delete' }).click()

    await expect(page.locator('.rows__item', { hasText: 'Vegetables' })).toHaveCount(0)
    await page.goto('ingredients')
    await expect(page.getByRole('link', { name: /Carrot/ })).not.toContainText('Vegetables')
  })
})
