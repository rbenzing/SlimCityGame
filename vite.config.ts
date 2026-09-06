/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { songsManifestPlugin } from './tools/vite-songs-manifest';

// The deploy target decides where the site lives: GitHub Pages serves it under
// /SlimCityGame/ and sets BASE_PATH in its workflow; Netlify and any other
// root-hosted deploy leave it unset and get '/'. Dev + Playwright stay at '/'.
export default defineConfig(() => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), songsManifestPlugin()],
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
          if (/\/node_modules\/(react|react-dom|scheduler|zustand)\//.test(path))
            return 'vendor-ui';
          return undefined;
        },
      },
    },
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // A handful of tests diffuse or hash full 256² grids. Each runs in well
    // under a second of real CPU, but under full-suite parallel load on the
    // vmThreads pool they can brush past vitest's 5s default and fail on
    // scheduler jitter rather than on anything about the code.
    testTimeout: 20_000,
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
