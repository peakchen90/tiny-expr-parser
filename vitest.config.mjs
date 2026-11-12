import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    reporters: ['verbose'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reportsDirectory: 'tests/coverage',
      reporter: ['json', 'text', 'lcov', 'clover'],
    },
  },
});
