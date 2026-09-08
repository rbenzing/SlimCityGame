# Texture standards

**Almost nothing in SlimCity is textured.** Every surface — terrain,
buildings, roads, vehicles, props — is vertex-coloured `InstancedMesh`
geometry against the calibrated material palette
(`src/render/palette.ts`), not a UV-mapped image. `public/` holds no image
assets at all (its only contents are `public/songs/`, audio files for the
in-game music player); nothing in `src/` imports `TextureLoader` or loads
an image file for a surface.

## What texturing does exist: three canvas sprites, drawn at runtime

The only `CanvasTexture` usage in the entire render tree is three sprite
billboards, each drawn onto an `HTMLCanvasElement` procedurally at
startup, not loaded from a file:

| File                   | Sprite                                            | Colour space           |
| ---------------------- | ------------------------------------------------- | ---------------------- |
| `src/render/sky.ts`    | Sun/moon disc sprites                             | `THREE.SRGBColorSpace` |
| `src/render/clouds.ts` | A cloud puff sprite (`drawPuffCanvas`)            | `THREE.SRGBColorSpace` |
| `src/render/pin.ts`    | The map-pin sprite shown over a selected building | `THREE.SRGBColorSpace` |

Each follows the same pattern: draw shapes onto a canvas with the 2D
canvas API, wrap it in `new THREE.CanvasTexture(canvas)`, set
`colorSpace = THREE.SRGBColorSpace`, and mark `needsUpdate = true`. There
is no texture atlas, no mipmap policy, and no compressed-texture format
(KTX2/Basis) anywhere, because there is no imported image to standardize
any of that for — a resolution or format standard would be regulating
something that does not exist yet.

## The real "texture standard": the calibrated material chart

`src/render/palette.ts`'s `MATERIALS` table is the actual governing
standard for how a surface looks, in place of a texture set:

- Every value is measured **sRGB 0–255**, named after the physical
  reference swatch it came from (`stainedConcrete`, `whiteBrick`,
  `bluePlaster`, `darkAsphalt`, `slateRoof`) — see
  [naming-conventions.md](naming-conventions.md).
- **`MAX_MATERIAL_CHANNEL = 140`** is a hard ceiling: nothing but snow may
  author a channel above it. The reasoning is lighting headroom, not
  taste — albedo is what a material _reflects_, not how bright it looks
  once lit, so a material authored near white leaves the renderer nothing
  left to add and blows out under a street lamp. Snow is the sole
  exception, capped separately at 144 (`MAX_SNOW_CHANNEL`).
- A separate `SATURATED` block covers painted accents (a signage band, an
  industrial stripe) and peaks even lower, at 102 — a saturated surface is
  still a surface, and obeys the same headroom rule rather than a
  brighter one.
- `MONOCHROME_RAMP` is the chart's neutral-grey ramp, for anything that
  needs a plain grey not tied to a named material.

Any new procedural surface calibrates against this chart (or extends it
with a new named entry measured the same way) rather than picking a colour
by eye, and stays under 140 unless it has a documented reason not to —
this is the closest thing this project has to a "texture-standards" rule,
and it governs colour, not resolution.

## Palette calibration in practice

`rgb255ToHex`/`hexToRgb255`/`rgb255ToUnit` are the only conversions
between the chart's 0–255 sRGB units and the 0–1 float units three.js
materials want; nothing in `src/render/` hand-converts a colour outside
these helpers. Vehicle paint (`src/render/vehicles.ts`) is the one
deliberate exception to the whole palette: cars are a curated ~10-colour
saturated list chosen to contrast against the deliberately desaturated
city, not calibrated against the reference chart at all — see
[props-and-vehicles.md](props-and-vehicles.md).
