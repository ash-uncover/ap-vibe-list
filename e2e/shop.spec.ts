import { test, expect } from '@playwright/test'
import { enterDemoWithData } from './helpers'

/** A list referencing four ingredients across two labels plus one unlabeled item. */
function seed() {
  return {
    labels: [
      { id: 'veg', name: 'Vegetables' },
      { id: 'dairy', name: 'Dairy' },
      { id: 'unused', name: 'Unused' }, // no ingredient uses it — must not appear as a group
    ],
    ingredients: [
      { id: 'carrot', name: 'Carrot', defaultUnit: 'piece', labelIds: ['veg'] },
      { id: 'tomato', name: 'Tomato', defaultUnit: 'piece', labelIds: ['veg'] },
      { id: 'milk', name: 'Milk', defaultUnit: 'piece', labelIds: ['dairy'] },
      { id: 'salt', name: 'Salt', defaultUnit: 'piece', labelIds: [] }, // unlabeled → "Other"
    ],
    lists: [
      {
        id: 'list1',
        name: 'Weekend shop',
        status: 'active',
        createdAt: new Date().toISOString(),
        items: [
          { ingredientId: 'carrot', quantity: 2, unit: 'piece' },
          { ingredientId: 'tomato', quantity: 3, unit: 'piece' },
          { ingredientId: 'milk', quantity: 1, unit: 'piece' },
          { ingredientId: 'salt', quantity: 1, unit: 'piece' },
        ],
        recipes: [],
        bought: [],
      },
    ],
  }
}

test.describe('shopping view — grouped by label', () => {
  test('groups items under label headers, with unlabeled under "Other" and empty labels hidden', async ({
    page,
  }) => {
    await enterDemoWithData(page, seed())
    await page.goto('lists/list1')

    await expect(page.getByRole('heading', { name: 'Weekend shop' })).toBeVisible()

    // Only labels with items appear, alphabetically, "Other" last. "Unused" is absent.
    await expect(page.locator('.shop-group__name')).toHaveText(['Dairy', 'Vegetables', 'Other'])

    const veg = page.locator('.shop-group', { hasText: 'Vegetables' })
    await expect(veg.locator('.check__name')).toHaveText(['Carrot', 'Tomato'])

    const other = page.locator('.shop-group', { hasText: 'Other' })
    await expect(other.locator('.check__name')).toHaveText(['Salt'])
  })

  test('label groups are collapsible', async ({ page }) => {
    await enterDemoWithData(page, seed())
    await page.goto('lists/list1')

    const dairy = page.locator('.shop-group', { hasText: 'Dairy' })
    await expect(dairy.locator('.check__name')).toHaveText(['Milk'])

    await dairy.locator('summary').click() // collapse
    await expect(dairy.locator('.check__name')).toBeHidden()

    await dairy.locator('summary').click() // expand again
    await expect(dairy.locator('.check__name')).toBeVisible()
  })

  test('ticking an item in its group updates the group progress', async ({ page }) => {
    await enterDemoWithData(page, seed())
    await page.goto('lists/list1')

    const veg = page.locator('.shop-group', { hasText: 'Vegetables' })
    await expect(veg.locator('summary')).toContainText('0/2')
    await veg.getByText('Carrot').click()
    await expect(veg.locator('summary')).toContainText('1/2')
  })
})
