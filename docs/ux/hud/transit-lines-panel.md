# Transit lines panel

Floating in the same left slot as the district panel above. It opens
while a transit line-drawing tool is in hand — Bus Line, Rail Line, or
Tram Line, not a stop or station ploppable — or while the Transit
infoview lens is on. Like the district panel, it has no close button of
its own.

- **Header**: the transit icon and the "Transit Lines" label.
- While a line tool is in hand, a hint row reads "Click stops in order ·
  right-click to finish", naming the drawing gesture itself.
- Below that, every committed line the worker knows about: a swatch in
  the line's own color, its mode (`Bus`, `Rail`, or `Tram` — a line with
  no recorded mode reads as `Bus`) and id, its live ridership rounded to
  the nearest rider, and a delete button that removes it at once, with no
  confirmation step. Under each line, its service: the vehicles it runs over
  the vehicles it asked for, its headway in minutes and the month's running
  cost ("2 of 3 vehicles · every 4.1 min · ¢80/mo"); or, where no depot of
  its mode fields it, "No depot — build a Bus Depot" (Tram Depot, Rail Yard
  by mode) in the warning colour.
- With no lines committed yet, the list reads "No lines yet" instead,
  regardless of whether a line tool is currently in hand.
- A footer, "Transit running", sums the lines' running cost: the figure the
  month's expenses are charged for the fleet, apart from the depots' upkeep.

