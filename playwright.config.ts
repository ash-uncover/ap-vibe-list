import { defineConfig, devices } from '@playwright/test'

/**
 * E2E tests drive the real app through its demo mode (a localStorage-backed mock of the
 * GitHub Contents API — see src/github/mockClient.ts), so no PAT or network is needed.
 * The app is served from the Pages subpath /<repo>/; baseURL includes it so specs can use
 * relative paths like `ingredients`.
 */
const PORT = 5173
const BASE = '/ap-vibe-list/'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
