/** How many frames a series will write, to order the queue largest first. */
import { BUILDING_VIEWS, ROAD_VIEWS } from './views.mjs';

/** Views a town subject takes when it names none (see `photographTown`). */
const TOWN_VIEWS = 2;

/** Frames a series will write: a views series its `frames`; a town series its subjects' views
 * and their night frames; road pieces their three views; any other series the five views of each
 * subject. The last three add the declared details and the one night frame. */
export function framesOf(spec) {
  const subjects = spec.subjects ?? [];
  const details = spec.details?.length ?? 0;
  if (spec.type === 'views') return spec.frames?.length ?? 0;
  if (spec.type === 'town') {
    const views = subjects.reduce((n, s) => n + (s.views?.length ?? TOWN_VIEWS), 0);
    return views + subjects.filter((s, i) => s.night ?? i === 0).length;
  }
  const perSubject =
    spec.type === 'roads' || spec.type === 'street' ? ROAD_VIEWS.length : BUILDING_VIEWS.length;
  return subjects.length * perSubject + details + 1;
}
