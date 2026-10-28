# Services panel

Floating in the same left slot as the district and transit panels above,
and opening on the same terms: while a service building is in hand — a
police station, fire station, clinic, school or park, picked from any of
those dock drawers — or while one of the service lenses (Crime, Fire Risk,
Health, Education) is on. Like them it carries no close button.

- **Header**: the city glyph and the "Services" label, then a caption row
  naming the four columns — Service, Funding, Load, Worst.
- **One row per service** — Police, Fire, Health, then Elementary, Middle, High,
  College and Library, then Parks — each carrying all four together, the
  schools and the library reading one shared Education slider on the Elementary
  row (one department, so one funding), each its own load, because the slider and the gauge are the two
  answers to one question and splitting them across screens is what kept
  funding invisible:
  - a **funding slider**, 0 to 1.5 in steps of 0.05, with its value beside
    it as `×1.00`. Moving it sends the change and flips the local reading
    at once, ahead of the worker's confirmation, exactly as the district
    policy toggles do. Funding buys range, capacity and upkeep together —
    the upkeep charge the economy already makes.
  - a **load gauge** as a percentage of the capacity in reach: `138%` means
    the city's facilities of that kind are asked for 38% more than they can
    give. Under 100% takes the positive color and is not styled as a
    problem; over 100% takes the danger color.
  - the **worst district** figure beside it, the highest load over any tile
    that holds residents. A city can sit at 95% overall with one district
    at 240% because its facilities are the wrong side of a river, which is
    the whole reason the gauge is two numbers.
- Either figure reads `—` only where there is **nothing to read**: an
  uncapped kind (Parks, always), a kind with no capped facility built yet,
  and every row before the first service pass has run or on a mirror fed by
  a snapshot that never carried the field. The row is still there, because
  the funding slider is.
- A capped facility that reaches nobody reads **`0%`, not `—`**. The two are
  different answers and the panel must not blur them: `—` says the city has
  no facility of that kind whose load can be measured, and `0%` says it has
  one and nobody depends on it. A clinic stranded up a lane with no houses
  in reach is a mistake the player can fix; no clinic at all is a different
  mistake. Reading both as `—` hides the first behind the second.

