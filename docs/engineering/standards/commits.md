# Commits

## Conventional Commits, parsed by release-please

Every commit's type prefix decides the next version bump. From
[CONTRIBUTING.md](../../../CONTRIBUTING.md):

| Prefix                                                               | Example                                  | Version bump |
| -------------------------------------------------------------------- | ---------------------------------------- | ------------ |
| `fix:`                                                               | `fix: garbage trucks stall at dead ends` | patch        |
| `feat:`                                                              | `feat: add incinerator facility`         | minor        |
| `feat!:` / `fix!:` / `BREAKING CHANGE:`                              | `feat!: rework save format`              | major        |
| `docs:` `chore:` `refactor:` `test:` `ci:` `perf:` `build:` `style:` | maintenance                              | none         |

Scopes are optional (`feat(garbage): …`, `fix(roads): …`). Keep the subject
imperative and under ~72 characters; put rationale in the body.

## What the real git log looks like

Recent subjects read as full, specific sentences rather than terse labels —
`fix(roads): a one-way's yellow edge follows the way it runs (MUTCD
3B.07)`, `test(roads): ask the MESH what it drew, not only the grid`,
`fix(buildings): a plan is a size in metres, not a share of the tile`. The
type/scope prefix is the part release-please and the Conventional Commits
spec actually parse; the sentence after it is free-form prose describing
the change's effect, often citing the concrete standard or bug it
addresses (MUTCD section numbers appear routinely in `roads` commits — see
[ADR-0013](../adr/0013-traffic-figures-come-from-published-standards.md)).

## release-please owns the version — never hand-tag or hand-edit it

`release-please-config.json` + `.release-please-manifest.json` drive
[release-please](https://github.com/googleapis/release-please). The flow,
verified against `.github/workflows/release.yml`:

1. Conventional-Commit PRs merge into `main`.
2. `release-please` keeps one rolling **release PR** open, accumulating
   pending changes, the computed next version, and a generated
   `CHANGELOG.md`.
3. Merging that release PR bumps `package.json`, tags the commit
   (`vX.Y.Z`, `include-v-in-tag: true`), and publishes a GitHub Release.
4. That same workflow's `deploy` job (gated on
   `release-please.outputs.release_created`) then builds the SPA with
   `BASE_PATH: /SlimCityGame/` and deploys it to GitHub Pages.

**Never tag a release by hand, never hand-edit `package.json`'s version or
`CHANGELOG.md`.** The commit history is the only source of truth
release-please reads from; a hand-edited version or a hand-pushed tag
would drift from what the next release-please run computes and has no
way to reconcile back.

## Enforcement

Tooling-enforced: none, directly. There is no commit-lint hook in this
repository (no `commitlint` config, no `husky` pre-commit/commit-msg hook
visible) that would reject a malformed commit message before it lands.
release-please itself is the practical enforcement mechanism — a commit
that doesn't match its expected prefix pattern simply doesn't contribute a
changelog entry or a version bump, which is a silent miss, not a rejected
commit.
