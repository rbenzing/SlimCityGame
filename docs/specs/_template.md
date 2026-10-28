# <Feature or system>

- **Status:** Proposed | Agreed | Built

**Owns:** one line: what this spec decides, and nothing else.

**Rules:**

- An imperative of at most two lines, citing its truth: `[R-roads-012]`.
- Three to eight of them; the why goes below, not here.

**Numbers:**

| Constant         | Value | Unit | Source                      |
| ---------------- | ----- | ---- | --------------------------- |
| `NAME_IN_CODE`   | 12    | m    | [Author, title](https://…)  |

**Code:** `src/area/file.ts` `symbol` — the responsibility; one line a pointer.

**Tests:** `src/area/file.test.ts` — what it pins.

**Open:** one line per item logged in [the roadmap](../ROADMAP.md), or "none".

## Why the rules are what they are

Sections in the order a reader meets them in play. Each says why; a section
that only retells what the code does is deleted and its pointer kept above.
Sentences of at most 25 words; sections of at most 60 lines; no dates, no
slices, no PR numbers (those live in [history](../history/README.md)).

## Decided

- One line per decision that a reader might reopen: what was chosen, and the
  alternative it beat, with the reason in a clause.
