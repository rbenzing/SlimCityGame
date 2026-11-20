/** The pure judgments the road probes make over numbers read from the page.
 *
 * Nothing here touches a browser: a probe reads tiles, surfaces and grids with the dev hooks and
 * hands them to these functions, which say what is wrong. That keeps each judgment testable
 * with numbers made up for it.
 */

/** Tiles nearer a junction or a run's end than this are left out of the uniformity check. */
export const JUNCTION_CLEARANCE = 4;
/** How far two tiles of one run may disagree about a band's width, in metres. */
export const WIDTH_TOLERANCE_M = 0.05;
/** How far a band's edge may move between neighbouring tiles, in metres. */
export const STEP_TOLERANCE_M = 0.75;
/** Fewest tiles clear of junctions and ends a run needs for its uniformity to be judged. */
const MIN_CLEAR_TILES = 4;

export const median = (xs) => {
  const s = [...xs].sort((a, c) => a - c);
  return s[Math.floor(s.length / 2)];
};

/** The bands a tile lays across the road it runs on, in order across it. */
export const bandsOf = (tile, axis) =>
  tile.paint.filter((p) => p.axis === axis).sort((a, c) => a.from - c.from);

/** A tile's band layout as one comparable string. */
export const signatureOf = (bands) =>
  bands
    .map((b) => `${b.color}@${((b.from + b.to) / 2).toFixed(2)}w${(b.to - b.from).toFixed(2)}`)
    .join(' | ');

/** What a tile says about itself, for a failure message. */
export const describeTile = (t) =>
  !t.grid
    ? 'no road'
    : [
        `${t.grid.lanes} lanes`,
        `${t.grid.width.toFixed(2)}m`,
        t.grid.distance >= 0 ? `${t.grid.distance} from a junction` : 'no junction ahead',
        t.grid.pocket ? 'pocket' : null,
        t.grid.taper ? 'tapering' : null,
        t.grid.auxiliary ? 'auxiliary' : null,
      ]
        .filter(Boolean)
        .join('/');

const span = (s) => `[${s.from.toFixed(2)}..${s.to.toFixed(2)}]`;

/** The outer extent of every band of a tile at one end (`near` or `far`). */
const outerEdge = (bands, end) => ({
  from: Math.min(...bands.map((x) => x[end].from)),
  to: Math.max(...bands.map((x) => x[end].to)),
});

const stepBetween = (leaving, arriving) =>
  Math.max(Math.abs(leaving.from - arriving.from), Math.abs(leaving.to - arriving.to));

/**
 * The steps across the seam between two neighbouring tiles that exceed `tolerance`: the road's
 * own outer edge, then each paint band present on both. A mark that starts or stops between
 * tiles is not a step; paint on both tiles in a different place is.
 */
export function seamSteps(a, c, { jittered = false, tolerance = STEP_TOLERANCE_M } = {}) {
  const steps = [];
  if (a.length > 0 && c.length > 0) {
    const leaving = outerEdge(a, 'far');
    const arriving = outerEdge(c, 'near');
    const step = stepBetween(leaving, arriving);
    if (step > tolerance) steps.push({ label: 'edge', step, leaving, arriving });
  }
  // Gravel jitters its colour per tile on purpose, so its bands pair by position, not colour.
  const groups = jittered
    ? [['surface', a, c]]
    : [...new Set([...a, ...c].map((x) => x.color))].map((colour) => [
        colour,
        a.filter((x) => x.color === colour),
        c.filter((x) => x.color === colour),
      ]);
  for (const [label, mine, theirs] of groups) {
    if (mine.length !== theirs.length) continue;
    for (let i = 0; i < mine.length; i++) {
      const leaving = mine[i].far;
      const arriving = theirs[i].near;
      const step = stepBetween(leaving, arriving);
      if (step > tolerance) steps.push({ label: `band ${label}`, step, leaving, arriving });
    }
  }
  return steps;
}

/**
 * Judges one measured run of tiles `{ at, x, z, paint, grid, mesh }`.
 *
 * `measured` is `{ axis, x, z, from, to }`: the run's paint axis and its first and last
 * coordinate along it. `junctions` are tiles to stand clear of. Returns `{ failures, notes }`:
 * the edge and bands step no more than the tolerance between neighbours, every tile clear of
 * junctions and ends lays one section, and the grid and the mesh agree about what is drawn.
 */
export function auditRun({ tag, tiles, measured, junctions, jittered = false }) {
  const failures = [];
  const notes = [];
  // How much was asked, so a pass over nothing shows.
  const stats = { seams: 0, uniform: 0 };
  const laid = tiles.filter((t) => t.paint.length > 0);
  if (laid.length === 0) return { failures: [`${tag}: nothing was laid`], notes, stats };
  if (laid.length < tiles.length)
    notes.push(`${tag}: ${tiles.length - laid.length}/${tiles.length} tiles of the run are bare`);

  const endTile = (t) => t.at === measured.from || t.at === measured.to;
  const junctionTile = (t) => junctions.some((j) => j.x === t.x && j.z === t.z);
  const shifting = (t) => endTile(t) || junctionTile(t) || !t.grid;
  for (let k = 0; k + 1 < laid.length; k++) {
    const here = laid[k];
    const next = laid[k + 1];
    if (Math.abs(here.at - next.at) !== 1 || shifting(here) || shifting(next)) continue;
    stats.seams++;
    const steps = seamSteps(bandsOf(here, measured.axis), bandsOf(next, measured.axis), {
      jittered,
    });
    for (const s of steps) {
      failures.push(
        `${tag}: ${s.label === 'edge' ? "the road's edge" : s.label} steps ${s.step.toFixed(2)}m ` +
          `across the seam between (${here.x},${here.z}) leaving ${span(s.leaving)} and ` +
          `(${next.x},${next.z}) arriving ${span(s.arriving)}` +
          (s.label === 'edge' ? ` - ${describeTile(here)} then ${describeTile(next)}` : ''),
      );
    }
  }

  const at = (k) => ({
    x: measured.axis === 'x' ? measured.x : k,
    z: measured.axis === 'x' ? k : measured.z,
  });
  const clear = laid.filter((t) =>
    [...junctions, at(measured.from), at(measured.to)].every(
      (j) => Math.abs(t.x - j.x) + Math.abs(t.z - j.z) >= JUNCTION_CLEARANCE,
    ),
  );
  if (clear.length < MIN_CLEAR_TILES) {
    notes.push(`${tag}: only ${clear.length} tiles clear of junctions; uniformity not checked`);
  } else {
    stats.uniform = clear.length;
    const widths = clear.map((t) => {
      const bands = bandsOf(t, measured.axis);
      return {
        t,
        width: Math.max(...bands.map((p) => p.to)) - Math.min(...bands.map((p) => p.from)),
      };
    });
    const want = median(widths.map((u) => u.width));
    for (const u of widths) {
      if (Math.abs(u.width - want) > WIDTH_TOLERANCE_M)
        failures.push(
          `${tag}: tile (${u.t.x},${u.t.z}) is ${u.width.toFixed(3)}m wide, ` +
            `the run is ${want.toFixed(3)}m`,
        );
    }
    if (!jittered) {
      const signed = clear.map((t) => ({ t, sig: signatureOf(bandsOf(t, measured.axis)) }));
      const counts = new Map();
      for (const s of signed) counts.set(s.sig, (counts.get(s.sig) ?? 0) + 1);
      const [common] = [...counts.entries()].sort((a, c) => c[1] - a[1])[0];
      for (const s of signed) {
        if (s.sig !== common)
          failures.push(
            `${tag}: (${s.t.x},${s.t.z}) lays a different section from its run\n` +
              `      run:  ${common}\n      tile: ${s.sig}`,
          );
      }
    }
  }

  for (const t of clear) {
    if (!t.grid || !t.mesh) continue;
    if (t.grid.lanes !== t.mesh.lanes || Math.abs(t.grid.width - t.mesh.width) > WIDTH_TOLERANCE_M)
      failures.push(
        `${tag}: (${t.x},${t.z}) grid says ${t.grid.lanes} lanes/${t.grid.width.toFixed(2)}m, ` +
          `mesh draws ${t.mesh.lanes}/${t.mesh.width.toFixed(2)}m`,
      );
  }
  return { failures, notes, stats };
}

/**
 * Judges an overpass that was asked for: crossed over (the road beneath still the road that was
 * there) or refused whole (no tile of the deck standing in the air).
 * `raisedRows` are the deck's tiles with a raised elevation.
 */
export function judgeOverpass({ tag, crossedOver, tierBeneath, expectedTier, raisedRows }) {
  if (crossedOver) {
    return tierBeneath === expectedTier
      ? { verdict: 'crossed over' }
      : { verdict: 'crossed over', failure: `${tag}: the overpass took the road beneath it` };
  }
  if (raisedRows.length > 0)
    return {
      verdict: 'half built',
      failure:
        `${tag}: neither crossed over nor refused - ${raisedRows.length} tiles of the deck ` +
        `stand in the air with no crossing (rows ${raisedRows.join(', ')})`,
    };
  return { verdict: 'refused' };
}

/** The footway's surface colour in `readSurface`, which patches are labelled from. */
export const FOOTWAY = '0.82,0.81,0.79';

/** What each surface reads as in a corner map; an unlisted colour prints `?` and is named. */
export const LEGEND = {
  '0.42,0.42,0.43': '.', // asphalt
  [FOOTWAY]: '#', // footway and kerb
  '0.95,0.95,0.96': 'W', // white paint
  '0.92,0.76,0.16': 'Y', // yellow paint
  '0.55,0.55,0.53': 'g', // grey paint
  '0.28,0.50,0.26': 'm', // planted median
  '0.13,0.42,0.22': 'B', // bike-lane fill
  '0.60,0.24,0.18': 'U', // bus-lane fill
  '0.34,0.33,0.31': 'o', // rail ballast
};

/**
 * A surface the legend does not name. Gravel is tinted per tile off the ground under it, so
 * its colours cannot be listed: a warm mid-toned earth colour reads as gravel, anything else
 * stays `?`.
 */
export const classifyColour = (c) => {
  const [r, g, b] = c.split(',').map(Number);
  const earthy = b < r && b < g && Math.max(r, g) - b < 0.28;
  return earthy && b > 0.25 && Math.max(r, g) < 0.75 ? ',' : '?';
};

/** A sampled surface grid (`n` by `n`, row-major, null where terrain shows) as text. */
export function cornerText(grid, n) {
  const unknown = new Set();
  const lines = [];
  for (let r = 0; r < n; r++) {
    let line = '';
    for (let c = 0; c < n; c++) {
      const v = grid[r * n + c];
      if (v === null) line += ' ';
      else if (LEGEND[v]) line += LEGEND[v];
      else {
        const guess = classifyColour(v);
        if (guess === '?') unknown.add(v);
        line += guess;
      }
    }
    lines.push('    ' + line);
  }
  return { text: lines.join('\n'), unknown: [...unknown] };
}

const NEIGHBOURS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Flood-fills the footway cells of a sampled `n` by `n` surface into patches and answers which
 * patches arrive on each edge of the square (`edges`), whether two edges share one (`shares`),
 * and whether the pavement on one side runs past an arm joining that side (`runsPast`).
 */
export function footwayPatches(grid, n) {
  const isWalk = (r, c) => r >= 0 && r < n && c >= 0 && c < n && grid[r * n + c] === FOOTWAY;
  const patch = new Int32Array(n * n).fill(-1);
  let patches = 0;
  for (let r0 = 0; r0 < n; r0++) {
    for (let c0 = 0; c0 < n; c0++) {
      if (!isWalk(r0, c0) || patch[r0 * n + c0] !== -1) continue;
      const id = patches++;
      const stack = [[r0, c0]];
      patch[r0 * n + c0] = id;
      while (stack.length > 0) {
        const [r, c] = stack.pop();
        for (const [dr, dc] of NEIGHBOURS) {
          const nr = r + dr;
          const nc = c + dc;
          if (!isWalk(nr, nc) || patch[nr * n + nc] !== -1) continue;
          patch[nr * n + nc] = id;
          stack.push([nr, nc]);
        }
      }
    }
  }
  // `half` narrows an edge to one side of the road's centreline.
  const onEdge = (side, half) => {
    const ids = new Set();
    for (let i = 0; i < n; i++) {
      if (half === 'low' && i >= n / 2) continue;
      if (half === 'high' && i < n / 2) continue;
      const [r, c] =
        side === 'n' ? [0, i] : side === 's' ? [n - 1, i] : side === 'w' ? [i, 0] : [i, n - 1];
      const id = patch[r * n + c];
      if (id !== -1) ids.add(id);
    }
    return ids;
  };
  const edges = { n: onEdge('n'), s: onEdge('s'), e: onEdge('e'), w: onEdge('w') };
  const shares = (a, b) => [...edges[a]].some((id) => edges[b].has(id));
  // `arm` is the side the joining road is on; the pavement tested is the one it would interrupt.
  const runsPast = (arm) => {
    const [from, to, half] =
      arm === 'n' || arm === 's'
        ? ['w', 'e', arm === 'n' ? 'low' : 'high']
        : ['n', 's', arm === 'w' ? 'low' : 'high'];
    const a = onEdge(from, half);
    const b = onEdge(to, half);
    if (a.size === 0 || b.size === 0) return null;
    return [...a].some((id) => b.has(id));
  };
  return { edges, shares, runsPast, patches };
}

const CORNERS = [
  ['NW', 'n', 'w'],
  ['NE', 'n', 'e'],
  ['SE', 's', 'e'],
  ['SW', 's', 'w'],
];

/**
 * The two pedestrian questions over a junction's footway patches. A corner is asked only where
 * footway arrives on both its sides; an access mouth (`serviceArms`) is asked whether the
 * pavement runs past it. The counts say how much was asked, so a pass over nothing shows.
 */
export function judgeFootway(walk, serviceArms) {
  const checkable = CORNERS.filter(([, a, b]) => walk.edges[a].size > 0 && walk.edges[b].size > 0);
  const broken = checkable.filter(([, a, b]) => !walk.shares(a, b)).map(([name]) => name);
  const past = serviceArms.map((arm) => [arm, walk.runsPast(arm)]);
  const cut = past.filter(([, ok]) => ok === false).map(([arm]) => arm.toUpperCase());
  const tested = past.filter(([, ok]) => ok !== null).length;
  const arriving = ['n', 'e', 's', 'w'].filter((k) => walk.edges[k].size > 0).join('');
  return { corners: checkable.length, broken, mouths: tested, cut, arriving };
}

/**
 * Judges the crosswalk painted over an undivided corridor's junction from a `cols` by `cols`
 * window of surface cells whose middle column is the edge the two halves share: no stop line
 * (a long white run) over that edge, and one run of bars on an even pitch across both halves.
 * Returns `{ failures, bars }` where `bars` is how many bars the best row held.
 */
export function crosswalkFindings(cells, cols) {
  const seam = cols / 2;
  const isWhite = (c) => typeof c === 'string' && c.startsWith('0.95');
  const rows = Array.from({ length: cols }, (_, r) => {
    const runs = [];
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const white = c < cols && isWhite(cells[r * cols + c]);
      if (white && start < 0) start = c;
      if (!white && start >= 0) {
        runs.push({ start, len: c - start });
        start = -1;
      }
    }
    return runs;
  });
  const failures = [];
  const crossesSeam = (run) => run.start < seam && run.start + run.len > seam;
  if (rows.some((runs) => runs.some((run) => run.len >= 16 && crossesSeam(run))))
    failures.push('a stop line runs on over the edge the two halves of the corridor share');
  const bars = rows.find((runs) => runs.length >= 8);
  if (!bars) failures.push('no crosswalk was painted over the undivided corridor');
  else {
    const pitches = bars.slice(1).map((run, i) => run.start - bars[i].start);
    // Bars sit on a pitch the cells cannot quite resolve, so it wobbles by one cell.
    if (Math.max(...pitches) - Math.min(...pitches) > 1)
      failures.push(`the crosswalk's bars lose their rhythm across the corridor: ${pitches}`);
    if (!bars.some((run) => run.start < seam) || !bars.some((run) => run.start >= seam))
      failures.push('the crosswalk does not run across both halves of the corridor');
  }
  return { failures, bars: bars?.length ?? 0 };
}

/**
 * Lamp offsets from a road's centre for the poles within a tile of row `z`, between x tiles.
 * `poles` are `{ x, z }` in metres.
 */
export function rowLampOffsets(poles, { z, x0, x1, tile }) {
  return poles
    .filter(
      (p) => Math.abs(p.z - (z + 0.5) * tile) < tile / 2 && p.x > x0 * tile && p.x < x1 * tile,
    )
    .map((p) => Math.abs(p.z - (z + 0.5) * tile));
}
