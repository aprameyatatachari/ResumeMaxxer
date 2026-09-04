import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests for ResumeMaxxer.
 *
 * These run against all three services for real - auth, API and frontend - plus
 * a real PostgreSQL. The only thing not exercised is Gemini: the AI endpoints
 * cost money and are non-deterministic, so they are covered by the mocked
 * backend tests instead. Everything here is deterministic and offline.
 *
 * The services are expected to already be running (CI starts them; locally,
 * use `start.bat`). `webServer` is deliberately not used: the stack needs a
 * database and migrations in a specific order, which the CI workflow does
 * explicitly and legibly.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // one shared database; parallel signups race on email
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  expect: {
    // The vault does a round trip through two services before it renders.
    timeout: 10_000,
  },
  timeout: 60_000,
})
