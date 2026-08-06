/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves this project site under /CitySim/, so the production
// build needs that base for correct asset URLs. Dev + Playwright stay at '/'.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/CitySim/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // Split the two heavyweight vendor families out of the main chunk
        // (was a single ~1.2MB index chunk): three.js (incl. its webgpu
        // entry) in one, the React/zustand UI stack in the other. scheduler
        // rides with react-dom (its only consumer) so the react chunk is
        // self-contained.
        manualChunks(id: string): string | undefined {
          const path = id.replace(/\\/g, '/');
          if (!path.includes('/node_modules/')) return undefined;
          if (/\/node_modules\/(three|@types\/three)\//.test(path)) return 'vendor-three';
          if (/\/node_modules\/(react|react-dom|scheduler|zustand)\//.test(path)) return 'vendor-ui';
          return undefined;
        },
      },
    },
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // The default 'threads'/'forks' pools crash at collection time with this
    // vitest 4.1.10 + vite 8.1.5 combination (`runner` singleton undefined when
    // describe() executes). vmThreads initializes the runner context correctly.
    pool: 'vmThreads',
    // Under vmThreads, externalized CJS deps get their own 'vitest' instance,
    // so jest-dom's expect.extend lands on the wrong expect. Inline it so it
    // shares the test file's vitest module graph.
    server: { deps: { inline: ['@testing-library/jest-dom'] } },
  },
}));
