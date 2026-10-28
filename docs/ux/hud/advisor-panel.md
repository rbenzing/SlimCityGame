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

