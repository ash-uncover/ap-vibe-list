import { test, expect } from '@playwright/test'
import { enterDemoWithData, readCollection } from './helpers'

test.describe('ingredients list', () => {
  // Current shape: ingredients reference labels by id, with a labels.json catalog.
  test('loads and resolves label ids to names (current data shape)', async ({ page }) => {
    await enterDemoWithData(page, {
      labels: [
        { id: 'l1', name: 'Légumes' },
        { id: 'l2', name: 'Laitage' },
      ],
      ingredients: [
        { id: 'a1', name: 'Courgettes', defaultUnit: 'piece', labelIds: ['l1'] },
        { id: 'a2', name: 'Lait', defaultUnit: 'piece', labelIds: ['l2'] },
      ],
    })

    await page.goto('ingredients')
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Courgettes/ })).toContainText('Légumes')
    await expect(page.getByRole('link', { name: /Lait/ })).toContainText('Laitage')
  })

  // Regression guard (the bug that shipped): the app also reads data from the default
  // branch, which may still use the legacy free-text `labels` with no labels.json. The
  // list must render without crashing and still show the labels.
  test('loads legacy data (free-text labels, no catalog) without crashing', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await enterDemoWithData(page, {
      ingredients: [
        { id: 'a1', name: 'Courgettes', defaultUnit: 'piece', labels: ['Légumes'] },
        { id: 'a2', name: 'Lait', defaultUnit: 'piece', labels: ['Laitage'] },
      ],
      // deliberately no labels.json
    })

    await page.goto('ingredients')
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Courgettes/ })).toContainText('Légumes')
    expect(pageErrors, 'the list must not throw on legacy data').toEqual([])
  })

  test('creates an ingredient with a brand-new label', async ({ page }) => {
    await enterDemoWithData(page, { ingredients: [], labels: [] })

    await page.goto('ingredients/new')
    await page.getByRole('textbox', { name: 'Name' }).fill('Tomato')
    const labelInput = page.getByRole('textbox', { name: /Add a label/ })
    await labelInput.fill('Vegetables')
    await labelInput.press('Enter')
    await expect(page.locator('.chip--removable')).toContainText('Vegetables')

    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('link', { name: /Tomato/ })).toContainText('Vegetables')
    // The new label was persisted to the catalog.
    const labels = await readCollection<{ name: string }>(page, 'labels')
    expect(labels.map((l) => l.name)).toContain('Vegetables')
  })

  test('warns on ingredients with 0 or more than 1 label', async ({ page }) => {
    await enterDemoWithData(page, {
      labels: [
        { id: 'veg', name: 'Vegetables' },
        { id: 'fresh', name: 'Fresh' },
      ],
      ingredients: [
        { id: 'ok', name: 'Carrot', defaultUnit: 'piece', labelIds: ['veg'] }, // exactly 1 — no warning
        { id: 'none', name: 'Salt', defaultUnit: 'piece', labelIds: [] }, // 0 — warning
        { id: 'multi', name: 'Tomato', defaultUnit: 'piece', labelIds: ['veg', 'fresh'] }, // 2 — warning
      ],
    })
    await page.goto('ingredients')

    const row = (name: string) => page.locator('.rows__item', { hasText: name })
    await expect(row('Carrot').locator('.rows__warn')).toHaveCount(0)
    await expect(row('Salt').locator('.rows__warn')).toHaveCount(1)
    await expect(row('Tomato').locator('.rows__warn')).toHaveCount(1)
    await expect(row('Salt').locator('.rows__warn')).toHaveAttribute('aria-label', /No label/)
    await expect(row('Tomato').locator('.rows__warn')).toHaveAttribute('aria-label', /Multiple labels/)
  })
})
