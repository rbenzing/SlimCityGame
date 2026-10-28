# Documentation strategy — short docs that agents can follow

- **Status:** Agreed; migration in progress (see the table at the end and the history)
- **Owner:** the docs set; `npm run lint:docs` enforces what it can

## The problem, measured

| What                                            | Size            | ≈ tokens | Who reads it                                                      |
| ----------------------------------------------- | --------------- | -------- | ----------------------------------------------------------------- |
| The whole set, 156 files                        | 2.47 MB         | 620k     | nobody whole; every agent reads parts                             |
| `GROUND-TRUTHS.md`, 258 rules in 8 sections     | 131 KB          | 33k      | **every agent before any change**, by `CLAUDE.md`                 |
| `ROADMAP.md`, 88% of it the history section     | 248 KB          | 62k      | any agent asked "what is built"; the Open list it needs is 5 KB   |
| `world-sim/road-model.md`                       | 103 KB          | 26k      | every roads task                                                  |
| `art/buildings.md`, `game-design/balancing.md`  | 89 KB, 85 KB    | 22k each | every kit task, every tuning task                                 |
| `engineering/interfaces.md`                     | 80 KB           | 20k      | every cross-thread task                                           |
| A feature, as a design + engineering pair       | 25–45 KB a file | 6–11k    | both read on every slice of the feature                           |

A roads task today costs an agent about 130k tokens of reading before it
writes a line: the truths whole, the road model whole, a feature pair, and
the roadmap if it is asked what exists. Most of that is narrative, history
and restatement. The rules and numbers inside it fit in a tenth of the space.

The set also breaks its own rule: `README.md` says a spec is never dated,
yet feature status lines carry slice dates, and the feature docs carry the
"what could go wrong" and "alternatives" sections of a proposal long after
the thing is built.

## The principle

**Reading cost is paid per agent per task; archive cost is paid once.**
Optimise what an agent *must* read, keep everything else reachable by link.
Nothing is deleted: a number, a rule, a source or a decision moves to the one
place that owns it, and the places that restated it link there instead.

## Four tiers, with budgets

| Tier | What                                                           | Budget a file     | Who must read it                                     |
| ---- | -------------------------------------------------------------- | ----------------- | ---------------------------------------------------- |
| 0    | `CLAUDE.md`, `docs/README.md`, `GROUND-TRUTHS.md` as an index  | 4 KB (1k tokens)  | every agent, every task                              |
| 1    | `docs/truths/<area>.md`: the rules of one area                 | 24 KB (6k tokens) | an agent touching that area                          |
| 2    | A spec: one feature or one system, card first                  | 24 KB (6k tokens) | the scout and the reviewer of a task on it; a cook reads the card and the section the ticket names |
| 3    | Archive: history, rationale, research digests, sources, ADRs   | none              | nobody by default; linked from the spec that used it |

A file over its budget is split by section into a folder with an index, never
trimmed by dropping a rule or a number.

## The card

Every tier 2 spec begins with a card: the six lines below, in order, before
the first section heading. Aim for 40 lines; a long Numbers table may run
past that. A scout stops at the first section, and a ticket cites the card's
anchors:

```markdown
# <Feature or system>

**Owns:** the one-line scope; what this spec decides and nothing else.
**Rules:** 3–8 bullets, imperative, each ≤ 2 lines, linking its truth by id.
**Numbers:** a table — value, unit, US source, the constant that holds it.
**Code:** `src/...` file and symbol per responsibility; no prose about what it does.
**Tests:** the test files that pin the rules above.
**Open:** what is logged in the roadmap for this spec, by one line each.
```

Below the card come the sections the rules need to be understood, in the
order a reader meets them in play. A section states *why*; the card states
*what*. A section that only retells what the code does is deleted and its
code pointer kept on the card.

## The rules of writing

- **One rule, one bullet, one id.** A truth is `- [R-roads-012]` followed by
  at most two lines and a pointer. Tickets, cards and commit messages cite the
  id. Ids are never reused; a withdrawn rule keeps its id with "withdrawn".
- **Numbers live in tables.** Value, unit, source, constant. Prose around a
  number says what it decides, never repeats it.
- **The why is short.** One sentence of rationale per rule; the research
  digest that produced it goes to tier 3 and is linked.
- **Never retell code.** A code pointer replaces a paragraph describing a
  function. If a reader needs the mechanism, the file is the mechanism.
- **Never date a spec.** Status is `Proposed`, `Agreed` or `Built`. Dates,
  slices and PR numbers live in the history file.
- **Never restate.** A spec links the truth; a truth links the spec; the
  roadmap links both. The same sentence in two files is a lint failure.
- **A built proposal becomes a spec.** When a feature's status turns to
  `Built`, its design and engineering pair merge into one spec with a card;
  "alternatives", "what could go wrong" and "how we will know" collapse into
  one-line `Decided:` bullets or go to history. Tests replace "how we will
  know".
- **Sentences ≤ 25 words, sections ≤ 60 lines.** A section longer than that
  is two sections.

## What each big file becomes

| Today                                   | After                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GROUND-TRUTHS.md` (131 KB)             | A 4 KB index: one row per area linking `docs/truths/<area>.md` with its id range, and the ids broken most often (their text stays in `CLAUDE.md`) |
| `ROADMAP.md` (248 KB)                   | Status, the Open list and milestones, ≤ 12 KB; history to `docs/history/<yyyy>-<mm>.md`, ≤ 8 lines an entry with a link to the spec that holds its rules |
| Feature pairs, 25 + 24 files            | One spec a feature in `docs/specs/<feature>.md`, card first, ≤ 24 KB; sources appendix to `docs/sources/<feature>.md` |
| `road-model.md`, `buildings.md`, `interfaces.md`, `data-model.md` | Folders with an index and one file a section, each ≤ 16 KB; `interfaces` and `data-model` done |
| `balancing.md`                          | Tables only: constant, value, source, code; one clause of rationale a row                                        |
| `art/*.md`                              | Kept; each gains a card; anything restating a truth links it; buildings and civic-massing are folders             |

## The agent protocol (goes into `CLAUDE.md`)

1. Read tier 0. Then read the truths of each area the task touches, by the
   index, and nothing else of the truths.
2. The scout reads spec cards, and opens a section only when the ticket needs
   its why. It returns pointers: `file#anchor`, rule ids, `src/file:line`.
3. A ticket cites rule ids and anchors, never "read the doc". A cook reads
   what the ticket cites.
4. A reviewer reads the full spec of the area under review, once.
5. When code and a rule disagree, stop and flag the rule by id.
6. A new rule is added as a truth with the next id and to the spec's card in
   the same change; a built slice adds one history entry and flips a status.

## Tooling (`npm run lint:docs`)

- **Links resolve** — exists.
- **Budgets** — a file over its tier's budget fails; tier is by path.
  Enforced for `docs/truths/`, `docs/specs/` and `docs/world-sim/road-model/`.
- **Card present** — every file under `docs/specs/` begins with the six card
  lines in order. Enforced.
- **No dated specs** — a date outside `docs/history/`, `ROADMAP.md` and
  `engineering/adr/` fails.
- **No restating** — a sentence of 12+ words appearing in two files fails,
  with both locations.
- **Ids unique** — `[R-<area>-<nnn>]` appears once as a definition; a cited
  id must exist. Enforced.
- **Lossless move check** (run by the migrating agent, not CI) — every
  number-with-unit, every `src/` pointer and every URL in the old files
  appears somewhere in the new set, or the PR says which and why.

## Migration, one reviewed PR at a time

| PR | Scope                                                                                      | Lossless check                                    |
| -- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 1  | Tooling with budgets as warnings; `CLAUDE.md` protocol; `README.md` map; ROADMAP history split, entries untouched | every entry byte-identical, filed by the first date in its heading |
| 2  | Truths split by area with ids; the index; cards on the twelve most-broken                 | 258 rules, 258 ids; every old pointer kept         |
| 3+ | One area a PR: merge its built pairs into specs with cards, split its reference doc; history entries stay untouched (tier 3 is never required reading); the area's budgets switch from warn to fail. Roads: done; world: done; buildings: done | the number / pointer / URL script per area |

Order of areas by reading cost: roads, buildings and kits, services, sim and
economy, render, UX. Each PR is cooked by a sonnet line-cook from a ticket
that names the files, the card template and the check script, and gated by a
reviewer who reads the before and after.

## What this buys

| Task                           | Must-read today | After     |
| ------------------------------ | --------------- | --------- |
| A roads rule fix               | ≈ 130k tokens   | ≈ 14k     |
| A kit detail pass              | ≈ 95k           | ≈ 12k     |
| "What is built and what is open" | ≈ 62k         | ≈ 3k      |

The guidelines do not get weaker. They get an id, a budget and a lint, which
is what makes an agent follow them.
