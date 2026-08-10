/**
 * The build-side half of the music folder: the plugin that lists it. Lives in
 * src so the normal `src/**` test glob picks it up; the plugin itself sits in
 * tools/ with the rest of the build tooling.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSongFiles, songsManifest } from '../../tools/vite-songs-manifest';

let root = '';
let songs = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'slimcity-songs-'));
  songs = join(root, 'songs');
  mkdirSync(songs);
  for (const name of ['b.mp3', 'a.MP3', 'c.wav', 'cover.jpg', 'README.md']) {
    writeFileSync(join(songs, name), '');
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('songs manifest', () => {
  it('lists only playable formats, case-insensitively', () => {
    const files = listSongFiles(songs);
    expect(files).toContain('a.MP3');
    expect(files).toContain('c.wav');
    expect(files).not.toContain('cover.jpg');
    expect(files).not.toContain('README.md');
  });

  it('is sorted, so the playlist order is stable across scans and platforms', () => {
    expect(listSongFiles(songs)).toEqual(['a.MP3', 'b.mp3', 'c.wav']);
  });

  it('a missing folder is an empty list, not a crash', () => {
    expect(listSongFiles(join(root, 'nope'))).toEqual([]);
    expect(songsManifest(join(root, 'nope'))).toBe('{"files":[]}');
  });

  it('serializes the shape the player parses', () => {
    expect(JSON.parse(songsManifest(root))).toEqual({ files: ['a.MP3', 'b.mp3', 'c.wav'] });
  });
});
