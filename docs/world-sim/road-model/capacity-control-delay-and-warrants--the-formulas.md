# Capacity, control delay and warrants — the formulas

The sim already speaks real units, so its numbers are real ones. A tile is
20 m. Speed is metres per second — a road's `speed` field is its posted
km/h divided by 3.6 (a two-lane road at 50 km/h is 14; an avenue at 65 km/h
is 18; a highway at 100 km/h is 28). An edge's path cost is
`length / speed` — seconds — scaled by `1 + 2·(v/c)` for congestion, so a
junction delay expressed in seconds adds to the cost directly and a
capacity expressed in vehicles per hour converts by one constant:

- **k = 3/7 game-capacity units per veh/h.** Chosen so the existing
  two-lane preset keeps its capacity of 600 (2 lanes × 700 veh/h × 3/7).
- **Per-lane capacity** `cap = S · (g/C) · k`, with S = 1,900 veh/h/lane —
  the Highway Capacity Manual's base saturation flow for a signalised urban
  lane — and g/C the share of the signal cycle the lane actually moves for,
  which is what separates a signalised arterial from a free-flowing
  highway. A highway lane instead uses the HCM's basic-freeway figure of
  2,350 veh/h/lane (free-flow at 65 mph, the closest to 100 km/h); a ramp
  uses 2,000 veh/h/lane; dirt and alley use observed rural figures of 250
  and 400 veh/h/lane. Transit and bike pieces carry people, so their
  figure is a car-equivalent of passenger throughput at the sim's own
  granularity: a reserved bus lane is worth 700 game-capacity units, a
  reserved tram lane 650 per track, a bike lane 75. Every per-lane figure
  rounds to the nearest 25.
- **Control delay**, in seconds, from the HCM's forms reduced to the two
  numbers the sim has — volume-to-capacity `x` on the approach, and cycle
  length: `none` 0; `yield` `3 + 4x²`; `stop` (minor approaches only)
  `9 + 12x²`; `allWayStop` `10 + 15x²` on every approach; `signal`
  Webster's uniform delay `0.5·C·(1 − g/C)² / (1 − x·g/C)`, with C = 60 s
  for a two-phase junction and 90 s once any approach has a dedicated left
  (a third phase), g/C the approach's own; `roundabout` `4 + 10x³`, the
  entry-delay curve of a single-lane roundabout — quick until it suddenly
  is not — with `x` the entry's v/c against its HCM entry capacity, not
  against its own road. Delay is per movement, dividing by however many lanes serve that
  movement, and is added to the edge cost of the approach.
  Every curve here is the sim's own reduced form of the manual's, not the
  manual's, and the roundabout's stays that way on purpose (decided): the HCM's single-lane entry delay (7th edition, Eq. 22-17)
  costs three to six times as much at moderate to high v/c, about 63 s
  against 14 s at capacity, and adopting it alone would make a roundabout
  far slower than a signal or a stop at load, which the reduced curves for
  those controls would then misstate. The controls are compared against each
  other, so they keep one kind of curve; adopting the manual's forms is a
  change to all of them together or none.
- **Warrants**, stated as v/c rather than vehicles per hour, because the
  MUTCD's absolute thresholds (500 vph major plus 150 vph minor for a
  signal; 300 plus 200 for an all-way stop; roughly 2,000 vpd combined for
  a yield or a stop between two minors) are each close to a fixed fraction
  of what the approach lanes carry, and a fraction survives a change to
  trip volume: two minors combined at v/c ≥ 0.15 earn a yield; a minor
  against a major at v/c ≥ 0.3 earns a stop; major ≥ 0.4 and minor ≥ 0.3
  earns an all-way stop; major ≥ 0.4 with ≥ 2 lanes per direction, against
  a minor ≥ 0.25, earns a signal. A player's override is never stepped.
- **Speed-change lane lengths**, from kinematics, `L = (v₁² − v₀²) / 2a`:
  an acceleration lane from a 60 km/h ramp (16.7 m/s) up to a 100 km/h
  highway (27.8 m/s) at a = 1.5 m/s² is 164 m, about 10 tiles, matching the
  AASHTO Green Book's 170 m; a deceleration lane at a = 2.0 m/s² is 123 m,
  about 8 tiles, matching AASHTO's 110–130 m.
- **Tapers**, from standard taper ratios: 1:50 on a highway or a ramp
  (a 3.5 m lane closes over 175 m, about 10 tiles), 1:30 on a divided road,
  1:10–1:15 on every other paved street class (35–50 m, about 3 tiles).
  The reduction itself is made away from an intersection (MUTCD 2023
  §3B.12 ¶01), and a parking lane that ends needs no taper of its own
  (§3B.12 ¶06).
- **Kerbside parking stalls**, from the 2009 MUTCD's parallel-parking layout
  (Figure 3B-21, carried by the 2023 edition's §3B.27 on parking space
  markings): stalls 8 ft (2.4 m) wide, an interior stall 22–26 ft and the
  game's 22 ft (6.7 m), the end stall 20 ft (6.1 m). The no-parking zones
  are the Uniform Vehicle Code's §11-1003, which most states adopt word for
  word (for instance Oklahoma, 47 O.S. §11-1003): 20 ft (6.1 m) from a
  crosswalk at an intersection, and 30 ft (9.1 m) on the approach to a stop
  sign or a traffic signal.
- **Angled and head-in stalls**, from the common 8.5 × 18 ft (2.6 × 5.5 m)
  stall laid at its angle: 60° gives a lane 5.5·sin 60° + 2.6·cos 60° ≈
  6.0 m deep and 2.6 ÷ sin 60° ≈ 3.0 m of kerb per stall; 90° gives 5.5 m and
  2.6 m. The 60° angle is backed into (MUTCD R7-10 back-in parking, §9B.10).
- **Accessible stalls**, from the US Access Board's public right-of-way rule
  (PROWAG): the count per block face from Table R211; a parallel space
  24 ft (7.3 m) long (R310.2.1); a head-in space with an 8 ft (2.4 m) access
  aisle (R310.3); an angled space 11 ft (3.35 m) wide with a 5 ft (1.5 m)
  aisle (R310.4). The symbol is the MUTCD's International Symbol of
  Accessibility pavement marking, white, on a blue square (2023 §3B.22
  ¶08–09).
- **Turn-lane storage**, from AASHTO's 15 m minimum plus one queued vehicle
  per 20 s of red at 7.5 m each: a local approach stores 2 cars (≈ 30 m) —
  an approach zone of 2 tiles; a collector 4–5 cars (≈ 50 m) — 3 tiles; an
  arterial 7–9 cars (≈ 70 m) — 4–5 tiles.
- **Roundabout size**, from inscribed circle diameter: one tile (20 m) is a
  mini roundabout (real range 13–25 m, ≤ 15,000 vpd); a 2×2 block (40 m)
  holds a compact roundabout of 36 m (NCHRP 1043's compact range 24–37 m,
  ≤ 15,000 vpd; FHWA's first guide calls 30–40 m an urban single-lane
  roundabout). Either one's entry carries the HCM's single-lane entry
  capacity against the traffic circulating in front of it (above).
- **Merge delay**, the one formula above that is not adapted from a
  published curve: `2 + 22·x³` seconds, where `x` is the v/c of the
  highway lane a ramp is merging into — small on an empty road, and the
  slip-road queue every motorway gets at rush hour once it climbs.

