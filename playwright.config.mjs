import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8080' },
  webServer: {
    command: 'npx http-server site -p 8080 -c-1 -s',
    port: 8080,
    reuseExistingServer: true,
  },
});
