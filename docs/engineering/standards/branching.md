# Branching

`main` is the only long-lived branch; everything else is a short-lived
feature branch merged into it. Beyond that, there is little to report, and
this document says so rather than inventing a convention.

## What is real

- Feature work happens on a branch off `main` and merges back into it.
  Recent branch names from this repository's history: `parking-on-lot`,
  `render-polish`, `road-shadows`, `save-stats`, `start-menu`,
  `tree-shadows`, `turn-centerline`, `turn-markings-all-tiers`,
  `feat/night-lighting-and-audio`.
- `release-please` maintains its own rolling branch
  (`release-please--branches--main--components--slimcity`) automatically —
  never create or push to it by hand.
- `ci.yml` runs on every push to `main` and every PR targeting `main`
  (`typecheck`, `lint`, `test`, `build`); there is no branch-protection
  config file in this repository to check against, so whether merges are
  actually gated on CI passing is a GitHub repository setting, not
  something visible in source.

## What is not real — no invented convention

**There is no enforced branch-naming scheme.** Most branch names above are
plain kebab-case descriptions of the work (`road-shadows`,
`turn-centerline`); exactly one uses a `type/` prefix
(`feat/night-lighting-and-audio`), and nothing in `CONTRIBUTING.md` or any
CI config requires or checks a prefix. Don't assume `feat/`, `fix/`, etc.
are required — pick a short, descriptive branch name; a `type/` prefix is
fine but not obligatory.

Contrast this with [commits.md](commits.md): commit _message_ prefixes
(`feat:`, `fix:`, …) are load-bearing — release-please parses them to
compute the next version. Branch names are not parsed by anything.
