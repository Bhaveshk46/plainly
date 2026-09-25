import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/web/**'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['test/web/**/*.test.{ts,tsx}'],
          setupFiles: ['test/web/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/server/index.ts', 'src/server/express.d.ts', 'src/web/main.tsx', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});
