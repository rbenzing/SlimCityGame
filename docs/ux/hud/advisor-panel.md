# Advisor panel

Floating at the right, near the top, opened from its corner button. It is
the panel that answers "what is actually wrong with the city right now" —
distinct from toasts, which report one-off events. Each row is a severity
dot (critical / warning / info), a title, and a one-line detail; rows with
a known location are clickable and fly the camera to the offending
building, or to the first tile of zoned land its road leaves without power
or water. An empty city shows a plain "nothing needs your attention"
rather than manufacturing a problem to look busy — an advisor that invents
work trains players to stop reading it. The ranking itself (severity, then
how many buildings are affected, tie-broken on a stable id so the list
never reshuffles under the player's cursor) is a pure function of the
building list and the city stats, so it updates without touching the
simulation.

A row tells the player to build only what the city has unlocked. Where the
answer is still locked it names the milestone instead ("Elementary School
unlocks at Small Town"). Counts and articles are written by one helper
(`counted`, `withArticle` in `src/ui/format.ts`), so "1 rider" and "an
elementary school" hold in every panel.

