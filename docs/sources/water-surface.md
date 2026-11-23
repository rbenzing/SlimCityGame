# The water surface — sources

What was found for [the spec](../specs/water-surface.md), and what was not. _Summary_ marks a figure taken from a search result's digest of a page that was not itself opened. The arithmetic is ours unless a line says otherwise.

## The look this follows

The player's reference is [threejs-water-free](https://github.com/baditaflorin/threejs-water-free) (MIT licence). It solves an ocean spectrum on the processor, uploads the result as textures each frame and displaces a mesh of 200 to 600 segments a side. Its surface reflects the sky, bends the view of the bed, deepens in colour with depth, foams at crests and shores, and throws light patterns on the bed. Floating objects ride it and never disturb it; it has no current. None of its code is copied.

## Wind waves from fetch

- **The relation.** Height `H = 0.283·U²/g·tanh(0.0125·X^0.42)` and period `T = 7.54·U/g·tanh(0.077·X^0.25)`, with `X = gF/U²`, wind `U` and fetch `F`. The constants were read on a [calculator page](https://www.formuladen.com/en/significant-wave-height-in-smb-prediction-method-formula/Formula-28285); a [page of the Shore Protection Manual](https://coastalhydraulicslaboratoryfact.tpub.com/sect54eng/sect54eng0046.htm) gives the depth-limited form, which reduces to them in deep water. The height at which `U` is measured was not confirmed.
- **Depth.** At 5 m/s over 1 km the depth-limited form gives 0.099 m in 1 m of water against 0.110 m in deep water. The spec uses the deep-water form and caps the height by depth.
- **Length and speed.** `L = gT²/2π`, about `1.56·T²` m, and `c ≈ 1.25·√L` m/s ([Wind wave](https://en.wikipedia.org/wiki/Wind_wave)). That page's table of fully developed seas lists lengths about 0.6 of this for its own periods, so it is not used.

Worked at three winds:

| Fetch | 5 m/s | 7 m/s | 10 m/s |
| --- | --- | --- | --- |
| 100 m | 0.04 m, 0.73 s, 0.8 m | 0.06 m, 0.87 s, 1.2 m | 0.09 m, 1.04 s, 1.7 m |
| 500 m | 0.08 m, 1.08 s, 1.8 m | 0.12 m, 1.29 s, 2.6 m | 0.19 m, 1.54 s, 3.7 m |
| 2 km | 0.15 m, 1.48 s, 3.4 m | 0.22 m, 1.78 s, 5.0 m | 0.33 m, 2.16 s, 7.3 m |
| 5 km | 0.21 m, 1.81 s, 5.1 m | 0.32 m, 2.19 s, 7.5 m | 0.48 m, 2.67 s, 11.1 m |

The amplitudes in the spec follow from a height of four standard deviations of the surface: the squared amplitudes of the bands present sum to an eighth of the height squared.

## Swell and the shore

- **Swell.** A dominant period of 8 s or more usually means swell ([NDBC](https://www.ndbc.noaa.gov/faq/windsea.shtml)); wind waves run about 3 to 6 s and fresh swell 7 to 10 s (a National Weather Service note, _summary_). Swell from a storm 10,000 km away arrives at 13 to 15 s ([Swell](https://en.wikipedia.org/wiki/Swell_(ocean))).
- **Not found:** a typical height for an ordinary day on a coast. The 1.0 m in the spec is a dial.
- **Shallow water.** A wave is in deep water where the depth is over half its length, and in shallow water where it is under a twentieth ([Wind wave](https://en.wikipedia.org/wiki/Wind_wave)). In shallow water its speed is `sqrt(g h)`, whatever its length ([Dispersion](https://en.wikipedia.org/wiki/Dispersion_(water_waves))). A swell 100 m long is in neither on this map's 8 m; the spec uses the shallow speed throughout.
- **Shoaling.** A wave's height grows as the depth to the power −¼: a sixteenth of the depth, twice the height ([Green's law](https://en.wikipedia.org/wiki/Green%27s_law)).
- **Arrival times.** The time a front takes to reach each point at a speed that varies from place to place is the eikonal equation, solved by the fast marching method (Sethian 1996; [Fast marching method](https://en.wikipedia.org/wiki/Fast_marching_method)).
- **The design wind.** Force 4, a moderate breeze, is 5.5 to 7.9 m/s: "small waves becoming longer; fairly frequent white horses" ([Beaufort scale](https://en.wikipedia.org/wiki/Beaufort_scale)).
- **Breaking.** A wave breaks in shallow water when its height passes 0.8 of the depth ([Wind wave](https://en.wikipedia.org/wiki/Wind_wave)). McCowan's 0.78 for a solitary wave is the figure usually quoted; no page stating it was opened.
- **Steepness.** In deep water a wave's height cannot pass 0.142 of its length ([Miche criterion](https://en.wikipedia.org/wiki/Miche_criterion), after Miche 1944). The same Wind wave page gives 0.17 as the onset of breaking; the spec's waves stay under 0.04.
- **Summing waves.** A sum of trochoidal waves keeps from looping while `Σ Q·k·a ≤ 1`; the chapter's example sums four in the vertex stage ([GPU Gems, chapter 1](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models)).

## Rivers

- **Speed.** The Mississippi's surface moves about 1.2 mph (0.54 m/s) at its headwaters and about 3 mph (1.34 m/s) at New Orleans ([National Park Service](https://www.nps.gov/miss/riverfacts.htm)). The Columbia's mean speeds at 5%, 55% and 95% of the depth are 1.19, 1.03 and 0.65 m/s (USGS data, _summary_).
- **Across the channel.** Speed is highest near the surface over the deepest part (_summary_). No page stating that it falls to nothing at the banks was opened, though it is standard hydraulics; the spec's curve is a dial.
- **Not found:** the current of a navigation canal, and the speeds of the Rhine and the Thames.

## Telling the three apart

No source gives a width or a depth that parts a river from a lake: hydrology parts them by whether the water flows (USGS, _summary_). The world here has one sea level and no flow, so shape stands in. The Mississippi is 6 to 9 m wide where it leaves Lake Itasca (National Park Service, above); no width for a lowland river or a ship canal was read on a page. The 200 m is a dial.

## Light in the water

- **Refraction.** Water's refractive index is 1.33 at 20 °C ([Optical properties of water and ice](https://en.wikipedia.org/wiki/Optical_properties_of_water_and_ice)); the reflectance facing the surface is `((n−1)/(n+1))²`, 0.02, rising toward a glancing view as `R0 + (1 − R0)(1 − cos θ)⁵` ([Schlick's approximation](https://en.wikipedia.org/wiki/Schlick%27s_approximation)).
- **Dimming with depth.** Light through a medium falls as `e^(−μd)` ([Beer–Lambert law](https://en.wikipedia.org/wiki/Beer%E2%80%93Lambert_law)).
- **Absorption.** Pure water absorbs 0.00922 per metre at 450 nm, 0.0565 at 550 nm and 0.34 at 650 nm ([Pope and Fry 1997](https://omlc.org/spectra/water/data/pope97.txt), Applied Optics 36). Hale and Querry 1973 give 0.0285, 0.0448 and 0.317 for the same colours; the newer set is used.
- **Clarity.** A clear lake's Secchi depth is over 5 m and a rich one's under 2.5 m ([Grand Valley State University](https://www.gvsu.edu/wri/education/instructors-manual-water-transparency-8.htm)). Rivers 1 to 2.5 m, clear lakes 1 to 8 m and oceans 1 to 80 m come from a scale read only as a _summary_.
- **Light on the bed.** The bright sheets spread apart with depth ([Atmospheric Optics](https://www.atoptics.co.uk/blog/opod-trout-optical-catastrophes/)). No depth at which they stop being seen was found; the 3 m is a dial.

## For boats, later

- A hull's wake spreads at 19.47° either side of its track in deep water ([Kelvin wake pattern](https://en.wikipedia.org/wiki/Kelvin_wake)).
- A displacement hull's speed is about `2.43·√L` knots for a waterline of `L` metres ([Hull speed](https://en.wikipedia.org/wiki/Hull_speed)).
