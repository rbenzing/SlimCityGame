/**
 * The version the game shows is `package.json`'s, baked in at build time, and
 * release-please keeps three files saying it at once: `package.json`, the
 * release manifest, and the newest heading in the changelog. They are written
 * by one tool in one commit, so they agree — right up until somebody edits one
 * of them by hand, which is a thing that happens when a changelog entry needs
 * correcting.
 *
 * These pin the three to each other. They cannot tell you whether a build is
 * the newest release — a feature branch is legitimately behind main, and a dev
 * build honestly showing an older version is not a fault — but they do catch
 * the case where the number on screen no longer matches the release it claims
 * to be part of.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (name: string): string => readFileSync(join(root, name), 'utf8');

const packageVersion = (): string => JSON.parse(read('package.json')).version as string;

/** The manifest release-please reads to know where it left off. */
const manifestVersion = (): string => {
  const manifest = JSON.parse(read('.release-please-manifest.json')) as Record<string, string>;
  const entries = Object.values(manifest);
  expect(entries).toHaveLength(1);
  return entries[0]!;
};

/** The version of the topmost changelog entry, which is the newest release. */
const changelogVersion = (): string => {
  const heading = read('CHANGELOG.md')
    .split('\n')
    .find((line) => line.startsWith('## '));
  expect(heading, 'CHANGELOG.md has no release heading').toBeTruthy();
  const match = /^## \[([^\]]+)\]/.exec(heading!);
  expect(match, `could not read a version out of: ${heading}`).toBeTruthy();
  return match![1]!;
};

describe('the version is one number in three files', () => {
  it('reads the same in package.json and the release manifest', () => {
    expect(manifestVersion()).toBe(packageVersion());
  });

  it('reads the same in package.json and the newest changelog entry', () => {
    expect(changelogVersion()).toBe(packageVersion());
  });

  it('is a plain semantic version, since it is rendered straight into the menu', () => {
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
