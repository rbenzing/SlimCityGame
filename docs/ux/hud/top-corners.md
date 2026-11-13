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

