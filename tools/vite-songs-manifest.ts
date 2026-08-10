/**
 * Serves a listing of `public/songs/` so the in-game music player can find
 * whatever the player dropped there.
 *
 * The folder is read on every request rather than watched and cached: a scan
 * is cheap, and it means a file dropped into the folder is playable from the
 * next Rescan with no dev-server restart and no stale cache to invalidate.
 * At build time the same listing is written once into the output, next to the
 * audio files Vite copies out of `public/`.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const SONGS_DIR = 'songs';
const MANIFEST_PATH = `/${SONGS_DIR}/manifest.json`;
const EXTENSIONS = ['.mp3', '.wav'];

/** Sorted so the playlist order is stable across scans on every platform. */
export function listSongFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return []; // folder not created yet
  }
}

export function songsManifest(publicDir: string): string {
  return JSON.stringify({ files: listSongFiles(join(publicDir, SONGS_DIR)) });
}

export function songsManifestPlugin(): Plugin {
  let publicDir = 'public';

  return {
    name: 'slimcity-songs-manifest',

    configResolved(config) {
      publicDir = config.publicDir;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path !== MANIFEST_PATH) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store'); // a rescan must see new files
        res.end(songsManifest(publicDir));
      });
    },

    // Emitted as a build asset rather than written with fs: it lands beside
    // the audio Vite copies out of public/, and it only runs for a real
    // bundle — an fs write in closeBundle also fired under vitest, which
    // resolves this config with a placeholder outDir.
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: `${SONGS_DIR}/manifest.json`,
        source: songsManifest(publicDir),
      });
    },
  };
}
