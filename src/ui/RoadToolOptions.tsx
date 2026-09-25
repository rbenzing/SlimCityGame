/**
 * Road tool options: how the next drag runs and what the selected road is
 * built of, laid out as panels beside the road cards in the roads drawer.
 * They exist only while a road is selected, since every one of them is about
 * that road. Rule zero applies as it always did: every control here flips
 * real, currently-consumed behavior, and a choice that would compose a road
 * the tool refuses is shown disabled with the reason rather than offered and
 * then refused.
 */
import type { JSX, ReactNode } from 'react';
import { BRIDGE_MAX_ELEVATION, ROAD_ELEVATION_STEP_M, TILE_METERS } from '../shared/constants';
import {
  composeProfile,
  editsOf,
  layRefusal,
  laneOptionsFor,
  presetProfileForTier,
  profileWidth,
  tilesAcross,
  CORRIDOR_METERS,
  roadClass,
  withArticle,
  type MiddleChoice,
  type ProfileEdits,
  type SideChoice,
  type TramChoice,
} from '../shared/roadprofile';
import type { RoadTier } from '../shared/types';
import { offersGrid, ROAD_TOOL_TO_TIER } from '../tools/tools';
import type { ToolMode } from './store';
import { useCityStore } from './store';

const CHIP = 'rounded-md px-2 py-1 text-xs font-medium transition-colors';
const CHIP_ON = 'bg-accent text-white';
const CHIP_OFF = 'bg-white/10 text-white/80 hover:bg-white/20';
const CHIP_DISABLED = 'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10';
const CHIP_STEP = `${CHIP} ${CHIP_OFF} ${CHIP_DISABLED}`;

/** A titled panel in the same card treatment as the road cards beside it. */
function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-1.5 rounded-[6px] border border-transparent bg-white/5 p-2"
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{title}</h3>
      {children}
    </section>
  );
}

/** One labelled line inside a panel; the labels share a column so the chips line up. */
function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-white/45">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * A segmented choice. `refusal` is why picking it would compose a road the
 * tool will not lay; the pressed choice is never disabled, since pressing it
 * again changes nothing.
 */
function Choice({
  pressed,
  refusal = null,
  title,
  onClick,
  children,
}: {
  pressed: boolean;
  refusal?: string | null;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  const disabled = !pressed && refusal !== null;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={disabled ? (refusal ?? undefined) : title}
      onClick={onClick}
      className={`${CHIP} ${pressed ? CHIP_ON : CHIP_OFF} ${CHIP_DISABLED}`}
    >
      {children}
    </button>
  );
}

const SIDE_CHOICES: readonly { value: SideChoice; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
];

const MIDDLE_CHOICES: readonly {
  value: MiddleChoice;
  label: string;
  piece: 'median' | 'centreTurn' | null;
}[] = [
  { value: 'none', label: 'None', piece: null },
  { value: 'median', label: 'Median', piece: 'median' },
  { value: 'turn', label: 'Turn lane', piece: 'centreTurn' },
];

const TRAM_CHOICES: readonly { value: TramChoice; label: string; title: string }[] = [
  { value: 'none', label: 'None', title: 'No tramway' },
  { value: 'mixed', label: 'Mixed', title: 'Rails in the traffic lanes — trams share them' },
  { value: 'reserved', label: 'Reserved', title: 'Two tracks of its own down the middle' },
];

/** Posted speeds move in the steps a speed limit sign is written in. */
const SPEED_STEP_KMH = 5;

/** How a path is drawn, where it snaps, how high it runs and what it does to roads in its way. */
function DrawingSection(): JSX.Element {
  const toolMode = useCityStore((s) => s.toolMode);
  const setToolMode = useCityStore((s) => s.setToolMode);
  const toolFlags = useCityStore((s) => s.toolFlags);
  const setToolFlags = useCityStore((s) => s.setToolFlags);
  const roadElevation = useCityStore((s) => s.roadElevation);
  const setRoadElevation = useCityStore((s) => s.setRoadElevation);
  const tool = useCityStore((s) => s.selectedTool);

  // A motorway has no `Grid`; with it selected, the motorway runs straight,
  // so that is the chip shown pressed.
  const grid = offersGrid(tool);
  const shownMode: ToolMode = !grid && toolMode === 'grid' ? 'straight' : toolMode;
  const modeButton = (mode: ToolMode, label: string, title?: string): JSX.Element => (
    <Choice pressed={shownMode === mode} title={title} onClick={() => setToolMode(mode)}>
      {label}
    </Choice>
  );

  return (
    <Section title="Drawing">
      <Row label="Path">
        <div className="flex gap-1">
          {modeButton('straight', 'Straight')}
          {modeButton('lpath', 'L-path')}
          {grid && modeButton('grid', 'Grid')}
          {modeButton(
            'curve',
            'Curve',
            'Three clicks: the start, the bend, then the end. Backspace takes back a click.',
          )}
        </div>
      </Row>
      <Row label="Snap">
        <div className="flex gap-1">
          <Choice
            pressed={toolFlags.angleLock}
            onClick={() => setToolFlags({ angleLock: !toolFlags.angleLock })}
          >
            90°
          </Choice>
          <Choice
            pressed={toolFlags.guideSnap}
            title={
              toolFlags.guideSnap
                ? 'A drag nearly in line with a road is pulled into line with it'
                : 'A drag goes exactly where it is pointed'
            }
            onClick={() => setToolFlags({ guideSnap: !toolFlags.guideSnap })}
          >
            Guide
          </Choice>
        </div>
      </Row>
      <Row label="Elevation">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Lower the road"
            title="Lower the road (Page Down)"
            disabled={roadElevation === 0}
            onClick={() => setRoadElevation(roadElevation - ROAD_ELEVATION_STEP_M)}
            className={CHIP_STEP}
          >
            Lower
          </button>
          <span
            aria-live="polite"
            className={`min-w-14 text-center text-xs tabular-nums ${
              roadElevation > 0 ? 'font-semibold text-accent' : 'text-white/70'
            }`}
          >
            {roadElevation === 0 ? 'Ground' : `${roadElevation} m`}
          </span>
          <button
            type="button"
            aria-label="Raise the road"
            title={`Raise the road (Page Up) — up to ${BRIDGE_MAX_ELEVATION} m`}
            disabled={roadElevation >= BRIDGE_MAX_ELEVATION}
            onClick={() => setRoadElevation(roadElevation + ROAD_ELEVATION_STEP_M)}
            className={CHIP_STEP}
          >
            Raise
          </button>
        </div>
      </Row>
      <Row label="Existing">
        <Choice
          pressed={toolFlags.replaceRoad}
          title={
            toolFlags.replaceRoad
              ? 'A drag lays this road over whatever is already there'
              : 'A drag leaves a bigger road where it finds one'
          }
          onClick={() => setToolFlags({ replaceRoad: !toolFlags.replaceRoad })}
        >
          Replace
        </Choice>
      </Row>
    </Section>
  );
}

/**
 * What the selected road's cross-section holds — how many lanes each way,
 * what separates them, how fast it is posted, what sits at its kerbs, what
 * transit it carries — and the width that adds up to against the tile. Only
 * what the road's class admits is offered, so a motorway is never asked about
 * parking and a local street is never offered four lanes; and of what is
 * offered, a choice that would break the class's rules or overrun the width
 * is disabled with the reason. Every control composes a real profile the next
 * drag lays.
 */
function ProfileSections({ tier }: { tier: RoadTier }): JSX.Element {
  const edits = useCityStore((s) => s.roadProfileEdits);
  const setEdits = useCityStore((s) => s.setRoadProfileEdits);

  const base = presetProfileForTier(tier);
  const cls = roadClass(base.class);
  const admits = new Set(cls.admits);
  const offersParking = admits.has('parking');
  const offersBike = admits.has('bike');
  const offersBus = admits.has('bus');
  const offersTram = admits.has('tram');
  const offersFootways = admits.has('sidewalk');

  const composed = composeProfile(base, edits);
  const current = editsOf(composed);
  const width = profileWidth(composed);
  const refusal = layRefusal(composed);
  const fits = refusal === null;
  // A road that outgrows its tile is not refused if its class earns a
  // corridor — it is laid across two. The readout has to say which, or a
  // player reads a 21 m road on a 16 m tile and thinks it is broken.
  const across = tilesAcross(composed);
  const widthTitle = refusal ?? (across === 2 ? 'Two tiles wide — a corridor' : 'Fits the tile');
  const budget = across === 2 ? CORRIDOR_METERS : TILE_METERS;

  /** Why this change would leave a road the tool will not lay, or null when it may. */
  const refusalOf = (change: Partial<ProfileEdits>): string | null =>
    layRefusal(composeProfile(base, { ...edits, ...change }));

  const oneWay = base.pieces
    .filter((p) => p.kind === 'travel')
    .every((p) => p.flow === 'fwd' && base.pieces.some((q) => q.kind === 'travel'));
  const laneOptions = laneOptionsFor(base.class);
  const offersLanes = laneOptions.length > 1;
  const middleChoices = MIDDLE_CHOICES.filter(
    (choice) => choice.piece === null || admits.has(choice.piece),
  );
  const offersMiddle = !oneWay && current.lanes > 0 && middleChoices.length > 1;
  const offersSpeed = cls.postedKmh.max > cls.postedKmh.min;

  // A road is PICKED from the lane counts its class is built in, rather than
  // dialled a lane at a time: a four-lane arterial is a kind of road, not a
  // three-lane with one added. The count is the total across both directions,
  // split evenly, which is how every road on the list is built.
  const totalLanes = oneWay ? current.lanes : current.lanes + current.lanesBack;
  const lanesEdit = (total: number): Partial<ProfileEdits> => {
    if (oneWay) return { lanes: total, lanesBack: null };
    const half = Math.max(1, Math.round(total / 2));
    return { lanes: half, lanesBack: half };
  };
  const setSpeed = (kmh: number): void =>
    setEdits({ postedKmh: Math.min(cls.postedKmh.max, Math.max(cls.postedKmh.min, kmh)) });

  const sideRow = (
    label: string,
    key: 'parking' | 'bike' | 'bus',
    value: SideChoice,
  ): JSX.Element => (
    <Row label={label}>
      <div className="flex gap-1" role="group" aria-label={`${label} lanes`}>
        {SIDE_CHOICES.map((choice) => (
          <Choice
            key={choice.value}
            pressed={value === choice.value}
            refusal={refusalOf({ [key]: choice.value })}
            onClick={() => setEdits({ [key]: choice.value })}
          >
            {choice.label}
          </Choice>
        ))}
      </div>
    </Row>
  );

  const offersKerbside = offersParking || offersBike || offersFootways;
  const offersTransit = offersBus || offersTram;

  return (
    <>
      <Section title="Carriageway">
        {offersLanes ? (
          <Row label="Lanes">
            <div className="flex items-center gap-1" role="group" aria-label="Lanes">
              {laneOptions.map((n) => (
                <Choice
                  key={n}
                  pressed={totalLanes === n}
                  refusal={refusalOf(lanesEdit(n))}
                  onClick={() => setEdits(lanesEdit(n))}
                >
                  {n}
                </Choice>
              ))}
              <span className="pl-1 text-[10px] text-white/45">{oneWay ? 'one way' : 'total'}</span>
            </div>
          </Row>
        ) : null}
        {offersMiddle ? (
          <Row label="Middle">
            <div className="flex gap-1" role="group" aria-label="Between the directions">
              {middleChoices.map((choice) => (
                <Choice
                  key={choice.value}
                  pressed={current.middle === choice.value}
                  refusal={refusalOf({ middle: choice.value })}
                  onClick={() => setEdits({ middle: choice.value })}
                >
                  {choice.label}
                </Choice>
              ))}
            </div>
          </Row>
        ) : null}
        {offersSpeed ? (
          <Row label="Speed">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Post a lower speed"
                disabled={current.postedKmh <= cls.postedKmh.min}
                onClick={() => setSpeed(current.postedKmh - SPEED_STEP_KMH)}
                className={CHIP_STEP}
              >
                −
              </button>
              <span
                aria-label="Posted speed"
                title={`${cls.postedKmh.min}–${cls.postedKmh.max} km/h for ${withArticle(cls.name)}`}
                className="min-w-14 text-center text-xs tabular-nums text-white/70"
              >
                {current.postedKmh} km/h
              </span>
              <button
                type="button"
                aria-label="Post a higher speed"
                disabled={current.postedKmh >= cls.postedKmh.max}
                onClick={() => setSpeed(current.postedKmh + SPEED_STEP_KMH)}
                className={CHIP_STEP}
              >
                +
              </button>
            </div>
          </Row>
        ) : null}
        <Row label="Width">
          <span
            aria-label="Profile width"
            title={widthTitle}
            className={`text-xs tabular-nums ${fits ? 'text-white/70' : 'font-semibold text-red-400'}`}
          >
            {width.toFixed(1)} / {budget} m
          </span>
        </Row>
      </Section>
      {offersKerbside ? (
        <Section title="Kerbside">
          {offersParking ? sideRow('Parking', 'parking', current.parking) : null}
          {offersBike ? sideRow('Bike', 'bike', current.bike) : null}
          {offersFootways ? (
            <Row label="Footways">
              <Choice
                pressed={current.footways}
                refusal={refusalOf({ footways: !current.footways })}
                onClick={() => setEdits({ footways: !current.footways })}
              >
                {current.footways ? 'On' : 'Off'}
              </Choice>
            </Row>
          ) : null}
        </Section>
      ) : null}
      {offersTransit ? (
        <Section title="Transit">
          {offersBus ? sideRow('Bus', 'bus', current.bus) : null}
          {offersTram ? (
            <Row label="Tram">
              <div className="flex gap-1" role="group" aria-label="Tramway">
                {TRAM_CHOICES.map((choice) => (
                  <Choice
                    key={choice.value}
                    title={choice.title}
                    pressed={current.tram === choice.value}
                    refusal={refusalOf({ tram: choice.value })}
                    onClick={() => setEdits({ tram: choice.value })}
                  >
                    {choice.label}
                  </Choice>
                ))}
              </div>
            </Row>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}

export function RoadToolOptions(): JSX.Element | null {
  const tool = useCityStore((s) => s.selectedTool);
  const tier = ROAD_TOOL_TO_TIER[tool];
  if (tier === undefined) return null;
  return (
    <div className="flex flex-wrap items-start gap-2" aria-label="Road tool options">
      <DrawingSection />
      <ProfileSections tier={tier} />
    </div>
  );
}
