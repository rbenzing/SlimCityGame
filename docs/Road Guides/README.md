# Road Guides

Reference standards the road work is checked against. The PDFs themselves are
git-ignored — the MUTCD alone is 31 MB, and a git blob is forever — so this
folder is empty in a fresh clone. Put the documents back by downloading them.

| Document                                                                    | Held here | Where it is used                                                                                                  |
| --------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| MUTCD, 11th edition (FHWA) — Part 2B signs, Part 3 markings, Part 4 signals | **yes**   | Junction control warrants, stop and give-way placement, lane and edge line colour, crossing and stop-bar geometry |
| AASHTO _A Policy on Geometric Design of Highways and Streets_               | **no**    | Lane widths, speed-change lane lengths, turn-lane storage, kerb-return radii                                      |
| Highway Capacity Manual                                                     | **no**    | Saturation flow, control delay, roundabout entry capacity                                                         |

**Only the MUTCD is actually in this folder, and the middle column is there so
nobody has to find that out the hard way.** Every geometric figure the road
model attributes to AASHTO, and every capacity figure it attributes to the HCM,
was taken from those standards but **cannot be re-checked against anything in
this repository**. They are not wrong; they are unverifiable here, which is a
different thing and worth knowing before trusting one. A figure cited to the
MUTCD can be opened and read in a minute — see below — and a figure cited to
the other two cannot be checked at all until someone puts the document back.

When one of those figures is questioned, say which of the two it is rather
than defending the number. Adding the missing documents is the fix; arguing
from memory about what the Green Book says is not.

The MUTCD splits into `part1.pdf` through `part9.pdf`; the whole document is
`mutcd11theditionr1hl.pdf`. Either works — the split parts are quicker to
search.

**Search them as text rather than paging through them.** `pdftotext` is
available on this machine, and a clause is far easier to find and quote
exactly this way than by scrolling a 31 MB PDF:

```sh
pdftotext -layout "docs/Road Guides/part3.pdf" /tmp/part3.txt
grep -n "left edge line" -i /tmp/part3.txt
```

That is how §3B.09's yellow-left-edge rule was found and quoted into
[road-model.md](../world-sim/road-model.md) after the motorway was shipped
painted white on both sides.

What each of these decides is written down in
[road-model.md](../world-sim/road-model.md), with the figure and the clause it
came from, so the code never has to be read against the standard to know why a
number is what it is. The choice to derive the road model from published
standards at all, and the one calibration constant that ties them to game units,
is [ADR-0013](../engineering/adr/0013-traffic-figures-come-from-published-standards.md).
The always/never rules that fall out of these standards, alongside the rest of
the game's invariants, are collected in [GROUND-TRUTHS.md](../GROUND-TRUTHS.md).
