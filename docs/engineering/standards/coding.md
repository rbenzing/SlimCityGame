# Coding

## TypeScript strictness

One `tsconfig.json`, `strict: true`, plus every stricter flag the compiler
offers beyond base strict mode: `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`,
`forceConsistentCasingInFileNames`, `isolatedModules`. `noUncheckedIndexedAccess`
is the one worth calling out — it means every array/record index access is
typed `T | undefined`, so `roadTier[i]` forces a nullish check or a
non-null assertion at the call site rather than silently trusting the
index is in range. `npm run typecheck` runs `tsc --noEmit`; CI
(`.github/workflows/ci.yml`) runs it on every push and PR to `main`.

There is one `tsconfig.json` for the whole project — worker code, render
code, and UI code alike, `lib: ["ES2022", "DOM", "DOM.Iterable", "WebWorker"]`
in a single array. This is why the sim/render firewall
([architecture-rules.md](architecture-rules.md)) cannot be caught by
`tsc`: a `sim/*.ts` file that referenced `document` would still typecheck,
because `DOM` types are in scope everywhere, not scoped away from worker
code.

## Module style

ESM throughout (`"type": "module"` in `package.json`). Modules import from
sibling directories with relative paths (`../shared/types`, not a path
alias) — there is no `paths` mapping in `tsconfig.json`. `resolveJsonModule`
is on, and `src/data/*.json` is imported directly as a module
(`import catalogData from '../data/catalog.json'`) rather than fetched at
runtime.

## What ESLint actually enforces

`eslint.config.js` is short:

```js
js.configs.recommended,
...tseslint.configs.recommended,
{
  files: ['src/**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  rules: {
    ...reactHooks.configs.recommended.rules,
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
},
```

That is the entire rule set: ESLint's and typescript-eslint's recommended
presets, React hooks rules (rules-of-hooks, exhaustive-deps), unused-vars
as an error (with a `_`-prefix escape hatch for intentionally-unused
params — this is the "`use`-named-param" trap to watch for: a parameter
literally named `use` does not match `^_` and will fail lint if unused),
and `console.log` as a warning (`console.warn`/`console.error` are
allowed). There is **no import-boundary rule, no custom rule for this
codebase's own conventions, no `max-lines` or complexity rule.** Anything
this document calls a "rule" beyond that list is convention, not lint —
said explicitly, rule by rule, in
[architecture-rules.md](architecture-rules.md) and
[dependency-map.md](../dependency-map.md).

## Prettier

`.prettierrc.json`: `singleQuote: true`, `semi: true`, `printWidth: 100`,
`trailingComma: "all"`. Run via `npm run format` (`prettier --write .`);
not currently wired into CI as a check step — `ci.yml` runs `typecheck`,
`lint`, `test`, `build`, no `prettier --check`.

## Comments

Read across `src/render/*.ts`, `src/sim/*.ts`, and `src/shared/*.ts`, the
real convention is: a comment explains **why**, not what — the code already
says what. Examples worth citing verbatim because they are typical, not
cherry-picked:

- `src/shared/constants.ts`'s `TILE_METERS` comment spends several lines on
  why 20 m and not 16 m (what it does to lane/median widths), not on what
  the constant does.
- Nearly every deterministic-hash helper in `src/render/*.ts` (`trees.ts`,
  `clouds.ts`, `landfill.ts`, `pedestrians.ts`, `props.ts`, `facade.ts`, …)
  carries a one-line comment of the shape "Deterministic hashing (never
  Math.random/Date.now)" — the reason, restated at every call site, not a
  description of the arithmetic.

**No comment references a documentation section as its justification.**
This was checked directly: `grep -rn "§" src --include="*.ts" --include="*.tsx"`
returns 45 hits, and all but two are inside `.test.ts`/`.test.tsx`
`describe`/`it` labels naming an old spec section the test was written
against (a test name, not a comment making an argument) — those section
numbers are now stale, since the specification is no longer one numbered
file. The two real exceptions are `src/app/persist.ts:33`
(`/** §21 garbage fill ... */`) and `src/render/landfill.ts:3`
(`(SlimCity SPEC §21)`) — both predate the documentation split and are
legacy, not the standard to write new code against. **Do not add a new
comment that cites a doc section**; if a comment needs to explain a rule
that lives in a doc, link the doc by name/path in prose, or better, don't
restate the rule at all and let the code speak for itself.

**No comment narrates history.** Comments describe the current state and
its reasoning ("this is 20 m because—"), never "this used to be X" or
"as of the Q3 refactor." A `git log`/`git blame` is where history belongs.

## JSDoc-style block comments

Used liberally on exported functions, classes, and non-obvious fields —
e.g. every field on `interface SaveMeta` in `src/app/persist.ts` carries a
`/** ... */` explaining what it holds and, where relevant, why it's
optional (a save written before the field existed loads with it absent).
This is a convention, not a lint-enforced one — there is no
`eslint-plugin-jsdoc` rule requiring it.
