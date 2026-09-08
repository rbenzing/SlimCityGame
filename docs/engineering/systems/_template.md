# <System> — system design

One sentence on what this system is responsible for, and one on what it is
explicitly not responsible for.

**Lives in:** `src/…` — the modules that make up this system.

## The model

The data structures the system owns, and why they are shaped that way. Name the
real types and arrays. If the shape is dictated by a decision, link the record
rather than re-arguing it.

## How it runs

The main loop or entry path, traced concretely: what is called, in what order,
what it reads and what it writes. A reader should be able to follow this against
the source with the file open. Name real functions.

## Invariants

What must always be true, and what enforces it. Distinguish the ones a test pins
(name the test) from the ones that are merely convention — a convention
presented as a guarantee is worse than saying nothing.

## Interactions

What this system reads from others and what it publishes. Link
[interfaces.md](../interfaces.md) for exact shapes rather than repeating them.

## Cost

Where the time goes, and how the cost scales with city size. The figure that
matters is the one that decides whether this system is the next thing to
optimise.

## Where it breaks

The failure modes, the edge cases that have actually bitten, and the parts a
newcomer reliably gets wrong. This section is the reason the document is worth
writing; do not leave it thin.
