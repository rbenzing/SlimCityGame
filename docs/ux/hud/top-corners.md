# Top corners

Two small button clusters, each button a filled circle roughly 32px across,
active state picked out in the accent color:

- **Left**: a single City info button, opening a popover with the city's
  vitals.
- **Right**, left to right: **Advisor** (a red badge counts current
  critical issues, so a closed panel still signals that something needs
  attention), **City stats** (opens the stats charts panel), **Photo
  mode**, **Help**, and — only once a game is running — **Menu**, which
  opens the pause overlay. There is no separate gear/settings button:
  Options lives inside that same Menu overlay, and Rule Zero (see
  [`interaction.md`](../interaction.md)) forbids a settings icon with nothing behind
  it.

## The active-view chip

Beside the City info button, while a lens is on or the city is underground,
a chip names the view: "Pollution lens", "Underground view", or "Water lens
· underground" where a lens brings the underground view with it. Its one
button, **Exit** with the `Esc` key shown, returns to the plain view in one
click: it turns the lens off and drops a tool that would keep the city
underground. The chip's text shortens before it reaches the right cluster,
and it is hidden with the rest of the chrome in photo mode `[R-design-018]`.
Below 640 px wide the Exit button shows its icon only.

Under the chip hangs the view's **legend**, with the lens picker open or
shut `[R-design-020]`. A lens of a value shows its colour scale with both
ends named in words and units; a lens of kinds (transit lines, districts)
lists them. The underground view names each thing drawn: water pipe,
sewer, a run nothing reaches, buried cable, junction box. A lens with
nothing to paint says what is missing ("Nothing to show yet: no polluters
built"). Colours and names are read from the tables the renderer paints
from (`src/shared/lenses.ts`), never a copy.

A value lens's scale follows what its value means `[R-design-022]`. Each
lens declares it once (`LENS_MEANING`): where more is worse (pollution,
noise, traffic, crime, fire risk, trash) the scale runs pale yellow to
dark red; where more is better (land value, the four school lenses,
health, happiness) it runs pale yellow through green to dark blue. Both
are ColorBrewer 2.0 scales flagged colour-blind safe (YlOrRd and YlGnBu,
five stops), and both run light to dark, so they read by lightness alone.
The map lays the lens over the city at 0.45 opacity with normal blending,
so the dark end shows as dark as its legend.

