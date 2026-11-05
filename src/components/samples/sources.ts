// Loads every sample file, the reasons table and the pins at build time.
//
// Vite resolves these globs when the site builds, so a sample file added or
// changed under samples/ is picked up without touching any page. The regions
// are extracted once per build. A marker error in any sample file fails the
// build here, with the file, line and region id in the message.

import { collectRegions, validateReasons } from '../../lib/samples/resolve.mjs';
import { parsePin } from '../../lib/samples/pins.mjs';
import reasonsTable from '../../data/unavailable.json';

const files = import.meta.glob<string>(
  [
    '/samples/{rust,js,web,kotlin,swift}/**/*.{rs,mjs,ts,kt,swift}',
    '!**/node_modules/**',
    '!**/target/**',
    '!**/build/**',
    '!**/.build/**',
    '!**/.generated/**',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const pinFiles = import.meta.glob<unknown>('/samples/pins/*.json', { import: 'default', eager: true });

export const regions = collectRegions(files);

export const reasons = validateReasons(reasonsTable);

/** The parsed pin for `rust`, `js`, `kotlin` or `swift`. Throws if the file is missing or invalid. */
export function pinFor(platform: string) {
  const path = `/samples/pins/${platform}.json`;
  if (!(path in pinFiles)) throw new Error(`samples/pins/${platform}.json is missing`);
  return parsePin(pinFiles[path], platform);
}
