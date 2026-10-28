# Street furniture and lamp kit

- **Bus-stop shelter**: the transit-agency shelter the bus-stop ploppable
  carries, 1.52 × 3.66 m with a glazed back and ends, a 6 ft bench, a
  receptacle and a flag sign with its bottom 7 ft up, from one builder
  shared with the kit, so a line's stop and a plopped stop read alike —
  low-poly, instanced, deterministic per stop; the figures are in
  [civic-massing.md](../civic-massing/reading-a-civic-building-at-a-glance/the-clinic-the-depot-and-the-bus-stop.md).
  A line's stop on a plopped bus stop's tile draws no shelter of its own.
- **Incident pins**: a call's marker is a cone the selection pin's size,
  4.4 m tall and 1.6 m across at its base, point down, hovering 2.5 m above
  the roof of the building it marks (above the ground where there is none),
  grown to one and a half times that by severity. It is read against the
  art anchors — taller than a 1.75 m person, shorter than a two-storey
  house — and never covers what it marks; its colour is the call's kind,
  dimmed toward ash when nobody is coming.
- **Pedestrians**: cosmetic low-poly people, a few idling at each shelter and
  a sparse scatter walking the sidewalks near Active buildings — instanced,
  deterministic, with a slow walk-cycle offset. Idling people cluster around
  the shelter's own ground anchor on the sidewalk, matching how far the
  shelter itself sits from the carriageway, rather than around the stop's
  road-tile centre; under a raised station, where no shelter stands, they
  stand on the platforms. A walker walks the **footway**, which is on the road
  tile and not the lot: the street's own cross-section puts the pavement
  between its verge and its kerb, and the lot's first row is the house's
  lawn — or the house. Anchored a tile back from the road instead, a walker
  whose home touched the street walked through its living room. The stroll
  is a stretch of pavement walked out and back along the street, barely
  across it, with a smooth turn at each end; which way "along" points is read
  from the road tile itself, so a corner lot's walker still follows the
  street it is standing on. A walker from a home with a front door also goes
  in: each cycle leaves the pavement, walks the house kit's own straight path
  to the door and comes back, so the people and the lot plan agree about
  where the door is. Lamps skip any tile a driveway crosses, so a lamp never
  ends up standing in the kerb cut cars drive through.
- **Lamp model**: a tapered pole, an arm bracket, and a real modeled lamp
  housing, not a bare box. The pole itself renders a mid charcoal (`0x50555d`)
  rather than a near-black — a tone that dark sits below the point where
  Lambert shading reads at all, and a slim pole disappears into a flat dark
  line at that colour — so the lighter charcoal still takes visible sun
  shading and reads as painted metal. Poles alternate sides of the street.
  See [lighting.md](../../visual-render/lighting.md) for the glow the housing itself carries at
  night, the spacing between poles, and the night schedule.

