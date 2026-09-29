import { describe, expect, it } from 'vitest';
import { RoadFlow, RoadTier } from '../../src/shared/types';
import type { SimSnapshot, WorkerToMain } from '../../src/shared/types';
import { column, roadRow, run, sandboxed, type Harness } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/** The most recent snapshot that carried junctions; it only travels when it changes. */
function lastJunctions(h: Harness): SimSnapshot['junctions'] {
  for (let i = h.messages.length - 1; i >= 0; i--) {
    const m = h.messages[i]!;
    if (m.type === 'snapshot' && m.snap.junctions !== undefined) return m.snap.junctions;
  }
  return undefined;
}

// A four-lane road is milestone-locked at the start, so these build in the sandbox.
describe('junction control — the sim tells the render who gives way', () => {
  it('reports the crossing of two quiet streets as controlled by nothing', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    // Two quiet streets crossing meet on sight lines. The junction is still
    // reported — the inspector has to have something to open on.
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'none', warranted: 'none', auto: true, turns: 0 },
    ]);
  });

  it('reports the crossing where a side street runs onto a four-lane road', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.FourLane, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'stop', warranted: 'stop', auto: true, turns: 0 },
    ]);
  });

  it('takes the control the player sets, and keeps it against the warrant', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'signal', warranted: 'signal', auto: true, turns: 0 },
    ]);

    // The warrant says signal; the player says a four-way stop, and the
    // warrant does not argue with it.
    const ack = run(h, 3, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'allWayStop' }]);
    expect(ack.ok).toBe(true);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'allWayStop', warranted: 'signal', auto: false, turns: 0 },
    ]);

    // And undo hands it back to the warrant.
    run(h, 4, ack.inverse);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'signal', warranted: 'signal', auto: true, turns: 0 },
    ]);
  });

  it('lets the player take a control away entirely, and saves what they chose', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    run(h, 3, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'none' }]);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'none', warranted: 'signal', auto: false, turns: 0 },
    ]);

    h.sim.handleMessage({ type: 'requestSave' });
    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const data = saves[saves.length - 1]!.data;
    const fresh = sandboxed();
    fresh.sim.handleMessage({ type: 'loadSave', data });
    fresh.ticks(4);
    // A signal the warrant would put back stays off, because the player said so.
    expect(lastJunctions(fresh)).toEqual([
      { x: 14, z: 20, control: 'none', warranted: 'signal', auto: false, turns: 0 },
    ]);
  });

  it('refuses a tile that is not a junction, since there is nobody to give way to', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 20, 9) }]);
    // Mid-run, a dead end, and bare ground.
    for (const [seq, x, z] of [
      [2, 14, 20],
      [3, 10, 20],
      [4, 30, 30],
    ] as const) {
      const ack = run(h, seq, [{ kind: 'setJunctionControl', x, z, control: 'stop' }]);
      expect(ack.ok, `${x},${z}`).toBe(false);
    }
  });

  it('refuses a control on a motorway, where nobody is ever stopped', () => {
    // An eastbound carriageway with a ramp leaving it southward at x = 20: a
    // diverge. Traffic on a motorway is never held, so neither a signal nor a
    // stop board can be put where a ramp leaves it, however the player asks.
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: roadRow(10, 20, 21) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.Ramp, tiles: column(20, 21, 4) }]);
    for (const [seq, control] of [
      [3, 'signal'],
      [4, 'stop'],
      [5, 'yield'],
      [6, 'allWayStop'],
    ] as const) {
      const ack = run(h, seq, [{ kind: 'setJunctionControl', x: 20, z: 20, control }]);
      expect(ack.ok, control).toBe(false);
    }
  });

  it('setting a junction to what it already carries costs nothing and undoes nothing', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    run(h, 3, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'stop' }]);
    const again = run(h, 4, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'stop' }]);
    expect(again.ok).toBe(true);
    expect(again.inverse).toEqual([]);
  });

  it('a bulldozed junction comes back with what the player set on it', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    run(h, 3, [{ kind: 'setJunctionControl', x: 14, z: 20, control: 'allWayStop' }]);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'allWayStop', warranted: 'signal', auto: false, turns: 0 },
    ]);

    const ack = run(h, 4, [{ kind: 'bulldoze', tiles: [{ x: 14, z: 20 }] }]);
    expect(ack.ok).toBe(true);
    run(h, 5, ack.inverse);
    h.ticks(4);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'allWayStop', warranted: 'signal', auto: false, turns: 0 },
    ]);
  });

  it('signalises where an avenue crosses, and stops sending once it settles', () => {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Avenue, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    expect(lastJunctions(h)).toEqual([
      { x: 14, z: 20, control: 'signal', warranted: 'signal', auto: true, turns: 0 },
    ]);

    const sent = h.messages.filter(
      (m) => m.type === 'snapshot' && m.snap.junctions !== undefined,
    ).length;
    h.ticks(20);
    expect(
      h.messages.filter((m) => m.type === 'snapshot' && m.snap.junctions !== undefined).length,
    ).toBe(sent);
  });
});

describe('turn restrictions — the player says what an arm may do', () => {
  /** A crossroads at (14, 20) with four arms. */
  function crossroads(): Harness {
    const h = sandboxed();
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 20, 9) }]);
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
    return h;
  }

  it('takes a turn away from one arm and gives it back on undo', () => {
    const h = crossroads();
    expect(lastJunctions(h)?.[0]?.turns).toBe(0);

    const ack = run(h, 3, [
      { kind: 'setJunctionTurns', x: 14, z: 20, arm: RoadFlow.West, allowed: 6 }, // through | right
    ]);
    expect(ack.ok).toBe(true);
    h.ticks(4);
    expect(lastJunctions(h)?.[0]?.turns).not.toBe(0);

    run(h, 4, ack.inverse);
    h.ticks(4);
    expect(lastJunctions(h)?.[0]?.turns).toBe(0);
  });

  it('saves what the player restricted, and a load brings it back', () => {
    const h = crossroads();
    run(h, 3, [{ kind: 'setJunctionTurns', x: 14, z: 20, arm: RoadFlow.North, allowed: 2 }]);
    h.ticks(4);
    const set = lastJunctions(h)?.[0]?.turns;
    expect(set).not.toBe(0);

    h.sim.handleMessage({ type: 'requestSave' });
    const saves = h.messages.filter(
      (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
    );
    const fresh = sandboxed();
    fresh.sim.handleMessage({ type: 'loadSave', data: saves[saves.length - 1]!.data });
    fresh.ticks(4);
    expect(lastJunctions(fresh)?.[0]?.turns).toBe(set);
  });

  it('refuses an arm with no road on it, and one that would leave nothing', () => {
    const h = crossroads();
    // The junction has four arms, so every cardinal is real; a T would not.
    const t = sandboxed();
    run(t, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 30, 9) }]);
    run(t, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 30, 5) }]);
    expect(
      run(t, 3, [{ kind: 'setJunctionTurns', x: 14, z: 30, arm: RoadFlow.North, allowed: 2 }]).ok,
    ).toBe(false); // nothing north of the bar
    expect(
      run(h, 3, [{ kind: 'setJunctionTurns', x: 14, z: 20, arm: RoadFlow.West, allowed: 0 }]).ok,
    ).toBe(false); // an arm has to keep something
  });

  it('refuses a tile that is not a junction', () => {
    const h = crossroads();
    expect(
      run(h, 3, [{ kind: 'setJunctionTurns', x: 12, z: 20, arm: RoadFlow.West, allowed: 2 }]).ok,
    ).toBe(false);
  });

  describe('and what one LANE of an arm may do', () => {
    /** A crossroads at (14, 20) with four arms. */
    function laneCrossroads(): Harness {
      const h = sandboxed();
      run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, 20, 9) }]);
      run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(14, 16, 9) }]);
      return h;
    }
    // The outer block's reader: a snapshot only carries junctions when the set
    // has moved, so the latest one that mentions them is the current truth.
    const junctions = lastJunctions;

    it('sets one lane of one arm, and gives it back on undo', () => {
      const h = laneCrossroads();
      h.ticks(4);
      expect(junctions(h)?.[0]?.laneTurns).toBeUndefined(); // nothing touched

      const ack = run(h, 3, [
        { kind: 'setJunctionLaneTurns', x: 14, z: 20, arm: RoadFlow.West, lane: 0, allowed: 1 },
      ]);
      expect(ack.ok).toBe(true);
      h.ticks(4);
      const set = junctions(h)?.[0]?.laneTurns;
      expect(set?.some((v) => v !== 0)).toBe(true);

      run(h, 4, ack.inverse);
      h.ticks(4);
      // Back to nothing said, which is how it is reported: no list at all.
      expect(junctions(h)?.[0]?.laneTurns).toBeUndefined();
    });

    it('leaves every other lane and arm alone', () => {
      const h = laneCrossroads();
      run(h, 3, [
        { kind: 'setJunctionLaneTurns', x: 14, z: 20, arm: RoadFlow.North, lane: 1, allowed: 4 },
      ]);
      h.ticks(4);
      const lanes = junctions(h)?.[0]?.laneTurns ?? [];
      // One arm's slot moved; the other three did not.
      expect(lanes.filter((v) => v !== 0)).toHaveLength(1);
    });

    it('refuses a lane an arm cannot hold, and one left with nothing', () => {
      const h = laneCrossroads();
      expect(
        run(h, 3, [
          { kind: 'setJunctionLaneTurns', x: 14, z: 20, arm: RoadFlow.West, lane: 9, allowed: 1 },
        ]).ok,
      ).toBe(false);
      expect(
        run(h, 4, [
          { kind: 'setJunctionLaneTurns', x: 14, z: 20, arm: RoadFlow.West, lane: 0, allowed: 0 },
        ]).ok,
      ).toBe(false);
    });

    it('refuses an arm with no road on it, and a tile that is no junction', () => {
      const h = laneCrossroads();
      expect(
        run(h, 3, [
          { kind: 'setJunctionLaneTurns', x: 14, z: 20, arm: RoadFlow.None, lane: 0, allowed: 1 },
        ]).ok,
      ).toBe(false);
      expect(
        run(h, 4, [
          { kind: 'setJunctionLaneTurns', x: 12, z: 20, arm: RoadFlow.West, lane: 0, allowed: 1 },
        ]).ok,
      ).toBe(false);
    });

    it('saves what the player set on a lane, and a load brings it back', () => {
      const h = laneCrossroads();
      run(h, 3, [
        { kind: 'setJunctionLaneTurns', x: 14, z: 20, arm: RoadFlow.North, lane: 0, allowed: 1 },
      ]);
      h.ticks(4);
      const set = junctions(h)?.[0]?.laneTurns;
      expect(set?.some((v) => v !== 0)).toBe(true);

      h.sim.handleMessage({ type: 'requestSave' });
      const saves = h.messages.filter(
        (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
      );
      const fresh = sandboxed();
      fresh.sim.handleMessage({ type: 'loadSave', data: saves[saves.length - 1]!.data });
      fresh.ticks(4);
      expect(junctions(fresh)?.[0]?.laneTurns).toEqual(set);
    });
  });
});
