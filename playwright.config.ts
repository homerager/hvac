import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3100)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['Galaxy Tab S9'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && node .output/server/index.mjs',
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(port),
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://hvac:hvac@localhost:5432/hvac',
    },
  },
})
