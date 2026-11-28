import type { Page } from '@playwright/test'

/**
 * Shapes used only to build fixture data. Kept local to the tests so specs can also seed
 * legacy-shaped records (free-text `labels`) that the app must still tolerate.
 */
export interface SeedIngredient {
  id: string
  name: string
  defaultUnit?: string
  labelIds?: string[] // current shape
  labels?: string[] // legacy shape (pre-migration)
}
export interface SeedLabel {
  id: string
  name: string
}

export interface SeedData {
  ingredients?: SeedIngredient[]
  labels?: SeedLabel[]
  recipes?: unknown[]
  templates?: unknown[]
  lists?: unknown[]
}

/**
 * Enter demo mode and seed the localStorage-backed mock with the given collections, then
 * reload so the app reads them. The storage key is discovered at runtime (the `:pat` entry
 * the demo login writes), so this never hardcodes the owner/repo.
 */
export async function enterDemoWithData(page: Page, data: SeedData = {}): Promise<void> {
  await page.goto('')
  await page.getByRole('button', { name: /demo mode/i }).click()
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith(':pat')))
  await page.evaluate((data) => {
    const patKey = Object.keys(localStorage).find((k) => k.endsWith(':pat'))!
    const prefix = patKey.replace(/:pat$/, '')
    const b64 = (t: string) => btoa(unescape(encodeURIComponent(t)))
    for (const [name, arr] of Object.entries(data)) {
      if (!arr) continue
      localStorage.setItem(
        `${prefix}:mock:data/${name}.json`,
        JSON.stringify({ sha: 'seed', content: b64(JSON.stringify(arr)) }),
      )
    }
  }, data)
}

/** Read a seeded collection back out of the mock (to assert what the app persisted). */
export async function readCollection<T = unknown>(page: Page, name: string): Promise<T[]> {
  return page.evaluate((name) => {
    const patKey = Object.keys(localStorage).find((k) => k.endsWith(':pat'))!
    const prefix = patKey.replace(/:pat$/, '')
    const raw = localStorage.getItem(`${prefix}:mock:data/${name}.json`)
    if (!raw) return []
    const { content } = JSON.parse(raw) as { content: string }
    return JSON.parse(decodeURIComponent(escape(atob(content))))
  }, name)
}
