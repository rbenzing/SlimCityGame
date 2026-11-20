/** Reading a frame back as light: how much of its noon light a surface keeps at night.
 *
 * The renderer writes sRGB through the neutral tone mapping, whose toe (for a pixel whose
 * darkest channel is under 0.08 linear, every channel loses `m - 6.25 m²`) crushes a dark
 * surface's night value far more than a bright one's: one share of noon light reads 6% on a
 * navy wall and 26% on a lawn. The bands are on the light, so the ratio is taken after undoing
 * both the sRGB curve and the toe.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** A body at night against the same pixel at noon. */
export const BODY_BAND = [0.18, 0.3];
/** The ground at night against the same pixel at noon: no brighter than the bodies on it. */
export const GROUND_BAND = [0.12, 0.25];
/** A noon reading under or over these luminances is not a body in daylight (black or sky). */
export const NOON_LUMA = [20, 180];

/** Decode a PNG of 8-bit RGB or RGBA, not interlaced, as Playwright writes them. */
export function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`png: ${data[8]}-bit depth unsupported`);
      colorType = data[9];
      if (data[12] !== 0) throw new Error('png: interlaced screenshots unsupported');
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error(`png: colour type ${colorType} unsupported`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? pixels[dst + i - channels] : 0;
      const b = y > 0 ? pixels[dst - stride + i] : 0;
      const c = y > 0 && i >= channels ? pixels[dst - stride + i - channels] : 0;
      let v;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      pixels[dst + i] = v & 0xff;
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const i = y * stride + x * channels;
      return [pixels[i], pixels[i + 1], pixels[i + 2]];
    },
  };
}

export const readPng = (path) => decodePng(readFileSync(path));

/** Mean colour and brightest channel over a pixel box `{ x, y, w, h }`. */
export function sample(png, box) {
  const sum = [0, 0, 0];
  let n = 0;
  let max = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const [r, g, b] = png.at(x, y);
      sum[0] += r;
      sum[1] += g;
      sum[2] += b;
      max = Math.max(max, r, g, b);
      n++;
    }
  }
  return { r: sum[0] / n, g: sum[1] / n, b: sum[2] / n, max };
}

export const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
export const show = (c) => `(${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)})`;

const srgbToLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** The light on the surface behind a display colour: sRGB undone, then the tone mapping's toe. */
export function toLight(c) {
  const out = [srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)];
  const darkest = Math.min(...out);
  // The toe maps the darkest channel m to 6.25 m² (m < 0.08); above it the offset is a flat 0.04.
  const m = darkest < 6.25 * 0.08 * 0.08 ? Math.sqrt(darkest / 6.25) : null;
  const offset = m === null ? 0.04 : m - 6.25 * m * m;
  const [r, g, b] = out.map((v) => v + offset);
  return { r, g, b };
}

/** The share of noon light a surface keeps: luminance of the light, night over noon. */
export const lightRatio = (night, noon) => luma(toLight(night)) / luma(toLight(noon));

/** Why a noon reading is not a body in daylight (a drifted camera reads sky or black), or null. */
export function noonProblem(noon) {
  const l = luma(noon);
  return l < NOON_LUMA[0] || l > NOON_LUMA[1]
    ? `reads ${show(noon)}, not a body in daylight`
    : null;
}

/** Why a night ratio is outside its band, or null. */
export function bandProblem(ratio, [lo, hi]) {
  return ratio < lo || ratio > hi
    ? `keeps ${(ratio * 100).toFixed(0)}% of noon light; the band is ${lo * 100}-${hi * 100}%`
    : null;
}
