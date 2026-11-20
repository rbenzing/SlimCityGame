/** The standard views of a shot series, as pure maths.
 *
 * A view is a camera (target tile, distance, yaw, pitch) that puts a whole box
 * in frame with a tenth of the frame clear at every edge, and a further tenth
 * at the bottom for the HUD bar. Nothing here touches a page.
 *
 * The camera sits at `target + distance * (cos pitch * sin yaw, sin pitch,
 * cos pitch * cos yaw)` and looks at the target on the ground: yaw 0 looks
 * north from the south, yaw pi/2 looks west from the east.
 */

/** The player's camera limits. */
export const MIN_DISTANCE = 40;
export const MAX_DISTANCE = 2400;
export const MIN_PITCH = 0.18;
export const MAX_PITCH = 1.45;

/** The viewport the series run in, and the camera's vertical field of view (45 degrees). */
export const ASPECT = 1280 / 800;
const TAN_HALF_FOV = Math.tan(Math.PI / 8);

/** A tenth of the frame clear at every edge, and a further tenth under the HUD bar. */
export const MARGIN = 0.1;
export const HUD = 0.1;

/** Metres of ground kept in frame past a building's footprint on every side: the drive crossing
 * the verge, the kerb and the first lane of the street. */
export const PAD = 10;

/** Pitch of the four faces and of the road's oblique, and of the straight-down view. */
export const FACE_PITCH = 0.4;
export const OBLIQUE_PITCH = 0.7;
export const ABOVE_PITCH = MAX_PITCH;
/** The road's low view down the centreline. */
export const ALONG_PITCH = 0.25;

/** A building's views, in the order they are taken. */
export const BUILDING_VIEWS = ['above', 'front', 'rear', 'left', 'right'];
/** A road piece's views. */
export const ROAD_VIEWS = ['above', 'along', 'oblique'];

/** Yaw that puts the street side of a box toward the camera. */
const STREET_YAW = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

/** Eye direction from the target for a yaw and pitch. */
const eyeDir = (yaw, pitch) => [
  Math.cos(pitch) * Math.sin(yaw),
  Math.sin(pitch),
  Math.cos(pitch) * Math.cos(yaw),
];

/** The corners of a box centred on the origin: sx metres along x, sz along z, h tall. */
const corners = (sx, sz, h) => {
  const out = [];
  for (const x of [-sx / 2, sx / 2])
    for (const z of [-sz / 2, sz / 2]) for (const y of [0, h]) out.push([x, y, z]);
  return out;
};

/** The least distance at which every point, seen from `target` shifted by `shift` along the
 * ground toward the box centre, falls inside the margins. */
const distanceFor = (points, yaw, pitch, shift) => {
  const u = eyeDir(yaw, pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const wide = 1 - 2 * MARGIN;
  const high = 1 - 2 * MARGIN;
  const low = 1 - 2 * (MARGIN + HUD);
  let need = 0;
  for (const [px, py, pz] of points) {
    // The point relative to the target, which sits `shift` metres along the view's ground direction.
    const rx = px + shift * sy;
    const rz = pz + shift * cy;
    const right = rx * cy - rz * sy;
    const up = -rx * sp * sy + py * cp - rz * sp * cy;
    const along = rx * u[0] + py * u[1] + rz * u[2];
    const k = TAN_HALF_FOV;
    const depth = Math.max(
      Math.abs(right) / (wide * ASPECT * k),
      up >= 0 ? up / (high * k) : -up / (low * k),
    );
    need = Math.max(need, depth + along);
  }
  return need;
};

/** How much farther than the least distance a view may stand to keep the box centred. */
const SLACK = 1.02;

/** The least gap, as a fraction of the frame, between any point and the top margin or the line the
 * HUD bar leaves, when the camera stands `distance` off, seen from `target` shifted by `shift`. */
const slackAt = (points, yaw, pitch, shift, distance) => {
  const u = eyeDir(yaw, pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  let slack = Infinity;
  for (const [px, py, pz] of points) {
    const rx = px + shift * sy;
    const rz = pz + shift * cy;
    const up = -rx * sp * sy + py * cp - rz * sp * cy;
    const depth = distance - (rx * u[0] + py * u[1] + rz * u[2]);
    const y = 0.5 - up / (depth * TAN_HALF_FOV) / 2;
    slack = Math.min(slack, y - MARGIN, 1 - MARGIN - HUD - y);
  }
  return slack;
};

/** A centred view may stand this much further off than the least distance to sit in the middle. */
const CENTRE_TOLERANCE = 1.1;

/** The camera for a box of sx by sz metres and h tall, seen at a yaw and pitch.
 * The target slides along the view's ground line to the spot that needs the least distance. With
 * `centre`, a thin box that has room to spare up and down the frame, or one that fits nearer than
 * the camera's floor, is stood in the middle of the frame instead of against an edge. */
const fit = (sx, sz, h, yaw, pitch, centre = false) => {
  const points = corners(sx, sz, h);
  const reach = Math.hypot(sx, sz) / 2;
  const shifts = Array.from({ length: 81 }, (_, i) => -reach + (i * reach) / 40);
  const tries = shifts.map((shift) => ({
    shift,
    distance: distanceFor(points, yaw, pitch, shift),
  }));
  // A box wider than it is deep is bound by its width, so sliding the target changes the distance
  // only a little: take the shift nearest the box centre among those within SLACK of the least.
  const least = Math.min(...tries.map((t) => t.distance));
  let best = tries
    .filter((t) => t.distance <= least * SLACK)
    .reduce((a, b) => (Math.abs(b.shift) < Math.abs(a.shift) ? b : a));
  let distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, best.distance));
  if (centre) {
    let roomiest = -Infinity;
    for (const shift of shifts) {
      const needed = distanceFor(points, yaw, pitch, shift);
      if (needed > distance * CENTRE_TOLERANCE) continue;
      const slack = slackAt(points, yaw, pitch, shift, Math.max(distance, needed));
      if (slack > roomiest) {
        roomiest = slack;
        best = { shift, distance: needed };
      }
    }
    distance = Math.min(MAX_DISTANCE, Math.max(distance, best.distance));
  }
  return {
    dx: -best.shift * Math.sin(yaw),
    dz: -best.shift * Math.cos(yaw),
    distance,
    yaw,
    pitch,
  };
};

/** A camera in tile terms: `cx`, `cz` the box centre as tile coordinates (the centre of a tile
 * when whole), `tile` the tile's size in metres. */
const place = (cx, cz, tile, f) => ({
  tx: cx + f.dx / tile,
  tz: cz + f.dz / tile,
  distance: f.distance,
  yaw: f.yaw,
  pitch: f.pitch,
});

/**
 * One view of a building or plot.
 *
 * `box`: `w`, `d` the footprint in tiles (local x and z, the street on local +z),
 * `h` the height in metres, `street` the compass side the street is on (`S` by
 * default), `tile` the tile size in metres, `cx`, `cz` the footprint centre as
 * tile coordinates. `left` and `right` are the viewer's own, standing at the front.
 */
export function buildingView(view, box) {
  const yawOf = { above: 0, front: 0, rear: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
  if (!(view in yawOf)) throw new Error(`unknown building view ${view}`);
  return seen(box, yawOf[view], view === 'above' ? ABOVE_PITCH : FACE_PITCH);
}

/** The front three-quarter used for the night frame: the front view turned a sixth of a turn. */
export const threeQuarterView = (box) => seen(box, Math.PI / 6, FACE_PITCH);

/** A building box seen from `turn` radians round from its street side. */
function seen(box, turn, pitch) {
  const street = box.street ?? 'S';
  const base = STREET_YAW[street];
  if (base === undefined) throw new Error(`unknown street side ${street}`);
  const turned = street === 'E' || street === 'W';
  const sx = (turned ? box.d : box.w) * box.tile + 2 * PAD;
  const sz = (turned ? box.w : box.d) * box.tile + 2 * PAD;
  return place(box.cx, box.cz, box.tile, fit(sx, sz, box.h, base + turn, pitch));
}

/**
 * One view of a run of road tiles.
 *
 * `run`: `x0`, `z0` the first tile and `length` the count of tiles, running east
 * (`axis` `x`, the default) or south (`z`), `tile` the tile size in metres. The
 * run is `width` tiles across (one by default, more for a junction's whole box)
 * and `height` metres tall (none by default, a bridge deck's rise otherwise).
 * The low view frames only the one tile wide corridor down the middle (or down
 * `line`, the tile index across the box of the road it should follow): a box as
 * wide as a junction would push a camera standing at its end far back.
 */
export function roadView(view, run) {
  const axis = run.axis ?? 'x';
  const box = run.width ?? 1;
  const across = view === 'along' ? 1 : box;
  const along = run.length * run.tile;
  const sx = axis === 'x' ? along : across * run.tile;
  const sz = axis === 'x' ? across * run.tile : along;
  // The low view looks down `line`, the tile index across the box of the road it follows (the middle by default).
  const middle = (box - 1) / 2;
  const line = view === 'along' ? (run.line ?? middle) : middle;
  const cx = run.x0 + (axis === 'x' ? (run.length - 1) / 2 : line);
  const cz = run.z0 + (axis === 'z' ? (run.length - 1) / 2 : line);
  // The low view stands at the run's first end and looks down its centreline.
  const axisYaw = axis === 'x' ? -Math.PI / 2 : Math.PI;
  const options = {
    above: [axis === 'x' ? 0 : -Math.PI / 2, ABOVE_PITCH],
    along: [axisYaw, ALONG_PITCH],
    oblique: [axisYaw + Math.PI / 4, OBLIQUE_PITCH],
  };
  if (!(view in options)) throw new Error(`unknown road view ${view}`);
  const [yaw, pitch] = options[view];
  return place(cx, cz, run.tile, fit(sx, sz, run.height ?? 0, yaw, pitch, true));
}

/** The bottom edge of the frame is this far below the view's own pitch. */
const HALF_FOV = Math.PI / 8;

/**
 * Tiles to leave between neighbours in a row so no neighbour shows in a side view
 * between its camera and its subject. The frame's bottom edge meets the ground
 * some way toward the camera; a neighbour must stand beyond that point by enough
 * that its roof is still below the edge. `boxes` are building boxes in row order
 * (`w`, `d`, `h`, `tile`), the street south.
 */
export function rowGaps(boxes) {
  const clear = (box, view, neighbourH) => {
    const { tx, distance, pitch } = buildingView(view, { ...box, cx: 0, cz: 0 });
    const slope = Math.tan(pitch + HALF_FOV);
    // The target may sit off the box centre, toward the camera, along the view's axis.
    const ground =
      Math.abs(tx) * box.tile + distance * Math.cos(pitch) - (distance * Math.sin(pitch)) / slope;
    const half = (box.w * box.tile) / 2 + PAD;
    return Math.max(0, ground + neighbourH / slope - half);
  };
  const gaps = [];
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1];
    const b = boxes[i];
    const metres = Math.max(clear(a, 'right', b.h), clear(b, 'left', a.h));
    gaps.push(Math.ceil(metres / a.tile) + 1);
  }
  return gaps;
}
