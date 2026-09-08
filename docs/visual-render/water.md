# Water rendering specification

Seas, lakes and dug canals are one surface: a plane at sea level, with the
terrain continuing visibly beneath it. There is no separate river geometry and
no flow.

## The surface

- **Seabed**: the terrain continues visibly under the surface — underwater
  vertex colours ramp blue-green with depth, fully tinted at a maximum visible
  depth of 12 m — so the land-to-water line reads under the surface exactly as
  it does above it.
- **Shoreline**: a static foam band draws every coastline where the height is
  within 0.4 m of sea level, and a second, animated band of scrolling foam
  brightens and pulses against it wherever the baked depth is under roughly
  0.8 m.
- **Surface animation**: three scrolling wave/normal layers — two shorter ones
  plus a long, ~35–60 m wavelength chop layer — combine with a sine-sum vertex
  swell (total swell amplitude budget ≤0.35 m) so the surface visibly moves at
  the default RTS camera distance (~600 m). Colour is depth-keyed (shallow teal
  to deep navy) with glancing-angle opacity and a broad, two-lobe sun glint
  tied to the day/night ramp — see [lighting.md](lighting.md).
- **Sky reflection**: an analytic, fresnel-weighted blend of the sky's zenith
  and horizon colours into the water's own colour, fed every frame from the
  same time-of-day ramp — no render pass, no cubemap.

The long-wavelength chop layer is the one that matters most and the least
obvious: without it the surface animates at wavelengths too short to read from
the default camera distance, and the water looks like a flat slate sheet.

All of this is achieved with a standard material plus animated UV offsets and
per-vertex displacement. There is no water shader — see
[shaders.md](shaders.md).

## Not built

**Dynamic fluid flow** — flowing rivers, a flood simulation — is an explicit
non-goal rather than a backlog item. A heightfield flow model is a performance
tar pit, and the derived sea-level model already covers seas, lakes and dug
canals.

**Planar reflections** (a true mirror render pass) are designed for but not
built; the analytic sky blend above stands in for them.

[../DESIGN.md](../DESIGN.md) owns both decisions and their reasoning.
