# Road Guides

Reference standards the road work is checked against. The PDFs themselves are
git-ignored — the MUTCD alone is 31 MB, and a git blob is forever — so this
folder is empty in a fresh clone. Put the documents back by downloading them.

| Document                                                                    | Where it is used                                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| MUTCD, 11th edition (FHWA) — Part 2B signs, Part 3 markings, Part 4 signals | Junction control warrants, stop and give-way placement, lane and edge line colour, crossing and stop-bar geometry |
| AASHTO _A Policy on Geometric Design of Highways and Streets_               | Lane widths, speed-change lane lengths, turn-lane storage, kerb-return radii                                      |
| Highway Capacity Manual                                                     | Saturation flow, control delay, roundabout entry capacity                                                         |

The MUTCD splits into `part1.pdf` through `part9.pdf`; the whole document is
`mutcd11theditionr1hl.pdf`. Either works — the split parts are quicker to
search.

What each of these decides is written down in the Roads section of
[SPEC.md](../SPEC.md), with the figure and the clause it came from, so the code
never has to be read against the standard to know why a number is what it is.
The choice to derive the road model from published standards at all, and the one
calibration constant that ties them to game units, is
[ADR-0013](../adr/0013-traffic-figures-come-from-published-standards.md).
