# Logging

**There is no logging convention in this codebase, and this document says
so rather than inventing one.** No logger module, no log-level system, no
structured log format. Grepping every non-test `.ts`/`.tsx` file under
`src/` for `console.` finds exactly two real call sites, both in
`src/main.ts`:

```ts
console.warn('SlimCity: bloom pipeline unavailable, rendering without post-FX:', err);
```

and

```ts
console.error('SlimCity failed to boot:', err);
```

(A third hit, in `src/core/events.ts`, is inside a JSDoc example in a
comment — `const unsubscribe = bus.on('tick', (t) => console.log(t));` —
illustrating how to use the event bus, not real logging code.)

## What ESLint allows

`eslint.config.js` sets `'no-console': ['warn', { allow: ['warn', 'error'] }]`
— `console.log`/`console.debug`/`console.info` trigger a lint warning
(not an error — `npm run lint` would still exit non-zero on a warning only
if something else is also configured to treat warnings as failures, which
nothing here does), while `console.warn` and `console.error` are allowed
outright. This rule shapes what's _permitted_, not what's _used_: the two
real call sites above are both `warn`/`error`, both inside `main.ts`, both
one-off boot/optional-feature failures — not a pattern applied elsewhere in
the ~200 other source files.

## What exists instead of logging

- **The command-ack/toast path** ([error-handling.md](error-handling.md))
  is how the player learns something failed — it's user-facing feedback,
  not a developer log.
- **The `window.__slimcity` dev read-back surface**
  ([debugging.md](debugging.md)) is how a developer or a screenshot harness
  inspects live state — structural queries, not a log stream.
- Playwright harnesses under `tools/*-shots.mjs` capture the browser's
  `console` output themselves (e.g. `visual-smoke.mjs`'s
  `page.on('console', (m) => logs.push(...))`) — this captures whatever the
  page happens to emit during a harness run, which today is almost nothing,
  since the app itself barely logs.

## If you need to add logging

There is no existing convention to extend, so use judgment rather than
inventing infrastructure for a single call site: a one-off diagnostic
during development belongs behind a `console.warn`/`console.error` (both
lint-clean) at the point of failure, matching the two real precedents in
`main.ts`, and should be removed or justified before it becomes permanent
noise. Anything that looks like it wants log levels, structured fields, or
a persistent log — there is no home for that here yet; that is a real gap,
not a hidden convention to discover.
