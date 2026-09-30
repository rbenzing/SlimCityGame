/**
 * The Interchange tool's options, beside its card in the roads drawer: which
 * form of interchange the next click lays, and the road it carries over the
 * motorway. Both are consumed by the tool's preview and its commit.
 */
import type { JSX } from 'react';
import type { InterchangeForm } from '../shared/interchange';
import { RoadTier } from '../shared/types';
import { Choice, Row, Section } from './RoadToolOptions';
import { useCityStore } from './store';

const FORMS: readonly { value: InterchangeForm; label: string; title: string }[] = [
  {
    value: 'diamond',
    label: 'Diamond',
    title: 'A ramp in each quadrant, every turn made at two junctions on the street',
  },
  {
    value: 'parclo',
    label: 'Partial cloverleaf',
    title: 'Loops take the two left turns onto the motorway off the street',
  },
  {
    value: 'cloverleaf',
    label: 'Cloverleaf',
    title: 'A loop for every left turn, so nothing turns across oncoming traffic',
  },
];

const STREETS: readonly { tier: RoadTier; label: string }[] = [
  { tier: RoadTier.TwoLane, label: 'Two-lane' },
  { tier: RoadTier.FourLane, label: 'Four-lane' },
];

export function InterchangeToolOptions(): JSX.Element | null {
  const tool = useCityStore((s) => s.selectedTool);
  const options = useCityStore((s) => s.interchange);
  const setInterchange = useCityStore((s) => s.setInterchange);
  if (tool !== 'interchange') return null;
  return (
    <div className="flex flex-wrap items-start gap-2" aria-label="Interchange tool options">
      <Section title="Interchange">
        <Row label="Form">
          <div className="flex gap-1">
            {FORMS.map((f) => (
              <Choice
                key={f.value}
                pressed={options.form === f.value}
                title={f.title}
                onClick={() => setInterchange({ form: f.value })}
              >
                {f.label}
              </Choice>
            ))}
          </div>
        </Row>
        <Row label="Crossing">
          <div className="flex gap-1">
            {STREETS.map((s) => (
              <Choice
                key={s.tier}
                pressed={options.streetTier === s.tier}
                onClick={() => setInterchange({ streetTier: s.tier })}
              >
                {s.label}
              </Choice>
            ))}
          </div>
        </Row>
      </Section>
    </div>
  );
}
