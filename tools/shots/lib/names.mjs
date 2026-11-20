/** Series names are output folders (`tools/shots/out/<name>/`), so two series may not share one.
 * A series' name is its file's name, in whichever type folder the file stands. */
import { readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/** A message naming the files of the first two series sharing a name, or null. */
export function clashOf(found) {
  const seen = new Map();
  for (const s of found) {
    const other = seen.get(s.name);
    if (other) return `two series are named '${s.name}': ${other.path} and ${s.path}`;
    seen.set(s.name, s);
  }
  return null;
}

/** A message naming a series file and another file of the same name in another type folder,
 * or null. Needs no import of the other files, so a series can check itself while running. */
export function fileClash(path) {
  const own = resolve(path);
  const seriesDir = dirname(dirname(own));
  const file = basename(own);
  for (const type of readdirSync(seriesDir)) {
    const other = join(seriesDir, type, file);
    if (other === own) continue;
    try {
      if (readdirSync(join(seriesDir, type)).includes(file))
        return `two series are named '${basename(file, '.mjs')}': ${path} and ${other}`;
    } catch {
      // a file beside the type folders, not a folder
    }
  }
  return null;
}
