/**
 * Unit-ish vector from the map center toward the sun (or, below the horizon,
 * the moon) for t in [0,1) — the same `elevation`/direction math
 * timeOfDayColors uses internally, factored out so sky.ts's
 * SunBillboard and clouds.ts can place themselves without recomputing the
 * whole color ramp. Pure: no three.js, no globals.
 */
export function sunDirection(t: number): { x: number; y: number; z: number } {
  const angle = t * Math.PI * 2;
  const elevation = -Math.cos(angle);
  const rawX = Math.sin(angle);
  const rawZ = 0.15; // small fixed tilt: keeps the shadow azimuth well-defined at zenith/nadir
  const len = Math.hypot(rawX, elevation, rawZ) || 1;
  return { x: rawX / len, y: elevation / len, z: rawZ / len };
}
