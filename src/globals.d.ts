/**
 * Build-time constants Vite substitutes into the bundle.
 *
 * `define` in `vite.config.ts` replaces these textually before TypeScript ever
 * sees a value, so they have to be declared rather than imported. Vitest reads
 * the same config, so a test sees the same substitution a build does.
 */

/** The released version, from `package.json` — the only place it is written. */
declare const __APP_VERSION__: string;
