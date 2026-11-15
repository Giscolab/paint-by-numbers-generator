import { defineConfig } from '@playwright/test';
import studioConfig from './playwright.config';

export default defineConfig({
  ...studioConfig,
  use: {
    ...studioConfig.use,
    baseURL: 'http://127.0.0.1:4174/paint-by-numbers-generator/',
  },
  webServer: {
    command: 'npm run build -- --base=/paint-by-numbers-generator/ --outDir .pages-test-dist && npm run preview -- --base=/paint-by-numbers-generator/ --outDir .pages-test-dist --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/paint-by-numbers-generator/',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key-not-a-secret',
    },
  },
});
