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

- Every value is a 0–255 triple named after the physical reference swatch
  it came from (`stainedConcrete`, `whiteBrick`, `bluePlaster`,
  `darkAsphalt`, `slateRoof`) — see
  [naming-conventions.md](naming-conventions.md). The renderer takes the
  number ÷ 255 as it stands on every path, so one swatch is one colour on
  screen wherever it is used `[R-render-040]`.
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

`mownLawn` is the one entry measured against the world rather than a
swatch: the chart's vegetation is foliage, and a home's garden laid in it
read as a dark rectangle against the grass around it. The lawn is the
terrain's fresh grass (82/148/66) at seven tenths, 57/104/46 — still grass,
and still plainly claimed ground.

## Palette calibration in practice

A swatch reaches the renderer two ways: as a vertex colour
(`rgb255ToUnit`, `materialUnit`) and as a hex handed to a `THREE.Color`
(`materialHex`, `saturatedHex`). three.js decodes a hex from sRGB, which
landed the same swatch two to seven times darker than its vertex colour,
and the tone mapping's toe then crushed the dark ones: a charcoal roof of
40 read 9 at noon beside a road reading 141. `paletteHex` in
`src/render/palette.ts` is the one conversion: it returns the hex whose
decoded value is the number ÷ 255, and both hex helpers go through it. A
part that glows in its own colour (a sign, a lit shopfront band) takes
`litHex`, the plain hex, so its glow is what it was. Nothing in
`src/render/` hand-converts a colour outside these helpers. Vehicle paint (`src/render/vehicles.ts`) is the one
deliberate exception to the whole palette: cars are a curated ~10-colour
saturated list chosen to contrast against the deliberately desaturated
city, not calibrated against the reference chart at all — see
[props-and-vehicles.md](props-and-vehicles/README.md).
