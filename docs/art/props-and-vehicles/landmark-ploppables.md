# Landmark ploppables

The three **airports** (an airfield, a regional and an international) are
landmarks, not a functional transit system. Each is drawn from one layout
([airports.md](../../specs/airports.md)):

- **One plate an airport**: grass over the plot, asphalt for the runway,
  taxiways, apron, kerb road and car park, and the paint merged into it —
  white on the runway, yellow on taxiways and holding positions. Three
  layers with a depth bias each, since layers a centimetre apart fought at
  the camera's distance.
- **Shared pools**, whatever the number of airports: building body, roof,
  lit pane, and one aircraft mesh a size (a trainer on a tie-down, a
  regional jet on a narrow stand, a twin-aisle airliner on a wide one).
  Aircraft are static props, nose to the building line; there is no flight
  simulation.
- **Nothing above ground** stands in the runway's safety area or object
  free area.

The **former airport** (8 × 6 tiles) keeps the kit it was built with for the
saves that hold one: a terminal slab with rooftop monitor boxes, a control
tower, an apron plate with taxiway striping and two or three parked planes.
It can no longer be bought.

More landmarks (a stadium, an observatory) are planned to reuse the same
landmark-mesh path.
