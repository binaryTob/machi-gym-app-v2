import { defineConfig, devices } from '@playwright/test';
import { config as env } from 'dotenv';

env({ path: '../api/.env' });

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: { baseURL: 'http://localhost:3000', ...devices['Desktop Chrome'] },
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: { command: 'corepack pnpm dev', cwd: '../..', url: 'http://localhost:3000/api/v1/health', reuseExistingServer: !process.env.CI, timeout: 120_000, env: { DATABASE_URL: process.env.DATABASE_URL ?? '', WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:3000' } },
});
