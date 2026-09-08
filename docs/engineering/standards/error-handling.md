# Error handling

There is no single error-handling framework (no custom `Result<T, E>` type,
no shared error class hierarchy). What exists is a small set of real,
repeated patterns, each suited to where it's used.

## Command failure: `CommandAck.reason`, surfaced as a toast

The one structured, user-facing error path. `CommandAck` (`src/shared/types.ts:442`)
carries `ok: boolean` and, when `ok === false`, `reason?: string` — the
comment at the field pins the known values: `'funds' | 'invalid' | 'locked'
| ...`. `main.ts`'s `onAck` handler (around line 988) maps that reason
straight to copy for a toast:

```ts
body:
  ack.reason === 'funds'
    ? 'Not enough funds.'
    : ack.reason === 'locked'
      ? 'Not unlocked at this milestone yet.'
      : 'That cannot be built there.',
```

**Follow this pattern for any new command failure mode**: give
`applyCommand` (`src/sim/worker.entry.ts`) a specific `reason` string
rather than a generic failure, and extend the ternary (or the copy table it
grows into) so the player sees a specific message rather than the
catch-all "That cannot be built there."

## Fail-soft on storage/optional-feature access, with a comment explaining why

`try { ... } catch { /* comment */ }` around browser storage or an optional
graphics feature, falling back to a sane default rather than surfacing an
error to the player. Two representative, real examples:

- `src/app/session.ts`'s `readAppSession()`: reads `sessionStorage`,
  catches and ignores a parse failure or a blocked storage API, and falls
  through to the menu-screen default — `// ignore malformed/blocked
storage — fall through to the menu default`.
- `src/render/bloom.ts`: wraps both bloom-graph construction and its
  per-frame render call in `try/catch`; either failure demotes the
  pipeline to `null` permanently so every later frame takes the cheap
  passthrough render path instead of re-throwing every frame.

The convention: **when a failure here is expected and recoverable, swallow
it locally, fall back to the safe default, and leave a comment saying which
failure is expected and why the fallback is fine.** Do not let it propagate
and crash the frame loop or the boot sequence over an optional feature.

## try/finally for resource cleanup

`src/app/persist.ts`'s IndexedDB helpers (`storeSave`, `loadLatestSave`,
`listSaves`, `deleteSave`, `getSaveById`) each open a `db` connection and
wrap the transaction in `try { ... } finally { db.close(); }` — cleanup
that must run whether or not the transaction succeeds, not error
swallowing.

## Uncaught failure at the boot boundary: log and stop

`main.ts`'s only top-level catch:

```ts
void main().catch((err: unknown) => {
  console.error('SlimCity failed to boot:', err);
});
```

If `startGame()`/`main()` throws anywhere during boot, this is the single
place it's caught, logged, and the app simply stops initializing — there
is no retry, no fallback UI shown to the player beyond whatever already
rendered. This is the one place an error is allowed to reach `console.error`
rather than being handled locally; see [logging.md](logging.md) for how
rare that is.

## What this codebase does NOT have — said plainly

- **No shared `Result`/`Either` return type.** Failure is communicated
  either through a `reason` string on a protocol type (`CommandAck`), a
  `null`/`false` return plus a fallback, or a thrown exception caught at a
  known boundary — never a common wrapper type.
- **No global error boundary in the React tree.** `src/ui/App.tsx` was not
  found to wrap its component tree in an error boundary; a thrown render
  error in a panel would behave however React's own default (unmounting)
  dictates, not something this codebase has designed for. If you are
  adding a panel with a real chance of throwing during render, there is no
  existing convention to lean on — treat this as an open gap, not a
  solved problem, and consider whether the panel needs its own boundary.
- **No retry/backoff convention anywhere** — every fail-soft path above
  degrades once and stays degraded (bloom's `graph = null` is permanent
  for the session) rather than retrying.
