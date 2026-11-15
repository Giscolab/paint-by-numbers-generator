import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    allowOnly: !process.env.CI,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/components/ui/**', 'src/integrations/supabase/types.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      thresholds: {
        statements: 39,
        branches: 25,
        functions: 25,
        lines: 38,
        'src/lib/colorUtils.ts': { lines: 95, branches: 85 },
        'src/lib/pbnModel.ts': { lines: 95, branches: 85 },
        'src/lib/fastImageOperations.ts': { lines: 95, branches: 85 },
        'src/lib/pngDpi.ts': { lines: 95, branches: 85 },
        'src/lib/lruCache.ts': { lines: 95, branches: 75 },
      },
    },
  },
});
