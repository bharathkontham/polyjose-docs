// @ts-check
/**
 * Pin files: which polyjose build each platform's samples are tested against.
 *
 * One file per platform, `samples/pins/<rust|js|kotlin|swift>.json`, in one
 * of three modes:
 *
 * - `{ "source": "none", "upcoming": "0.1.2" }`: no build to test yet. The
 *   platform's samples are reported as SKIPPED, never as passing.
 * - `{ "source": "git", "rev": "<40-hex commit>", "upcoming": "0.1.2" }`:
 *   before a release, the samples run against polyjose built from that
 *   commit with its own packaging scripts (which never publish).
 * - `{ "source": "registry", "version": "0.1.2" }`: after a release, the
 *   samples run against that exact published version.
 *
 * Install snippets show `upcoming` in the first two modes, and `version` in
 * the third. Unknown fields are rejected,
 * so a misspelt key fails instead of being ignored.
 */

/** @typedef {'rust' | 'js' | 'kotlin' | 'swift'} PinPlatform */

/** @type {readonly PinPlatform[]} */
export const PIN_PLATFORMS = Object.freeze(/** @type {PinPlatform[]} */ (['rust', 'js', 'kotlin', 'swift']));

/** The SemVer 2.0.0 grammar (semver.org, "Is there a suggested regular expression"). */
export const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** A full git commit id. Abbreviated ids and branch names are not pins. */
export const GIT_REV = /^[0-9a-f]{40}$/;

const FIELDS = /** @type {const} */ ({
  none: ['source', 'upcoming'],
  git: ['source', 'rev', 'upcoming'],
  registry: ['source', 'version'],
});

/**
 * @typedef {{ source: 'none', upcoming: string }} NonePin
 * @typedef {{ source: 'git', rev: string, upcoming: string }} GitPin
 * @typedef {{ source: 'registry', version: string }} RegistryPin
 * @typedef {NonePin | GitPin | RegistryPin} Pin
 */

export class PinError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'PinError';
  }
}

/**
 * Validates a parsed pin file and returns a normalized copy.
 *
 * @param {unknown} value  The parsed JSON.
 * @param {string} [platform]  Used to name the file in error messages.
 * @returns {Pin}
 */
export function parsePin(value, platform) {
  const where = platform ? `samples/pins/${platform}.json` : 'pin';
  const fail = (/** @type {string} */ message) => {
    throw new PinError(`${where}: ${message}`);
  };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail('must be a JSON object');
  }
  const pin = /** @type {Record<string, unknown>} */ (value);
  const source = pin.source;
  if (source !== 'none' && source !== 'git' && source !== 'registry') {
    return fail(`source must be one of none, git, registry (got ${JSON.stringify(source)})`);
  }
  const allowed = /** @type {readonly string[]} */ (FIELDS[source]);
  for (const key of Object.keys(pin)) {
    if (!allowed.includes(key)) fail(`${JSON.stringify(key)} is not allowed in ${source} mode (allowed: ${allowed.join(', ')})`);
  }
  const semver = (/** @type {string} */ field) => {
    const v = pin[field];
    if (typeof v !== 'string' || !SEMVER.test(v)) fail(`${field} must be a SemVer version such as "0.1.2" (got ${JSON.stringify(v)})`);
    return /** @type {string} */ (v);
  };

  if (source === 'none') return { source, upcoming: semver('upcoming') };
  if (source === 'git') {
    const rev = pin.rev;
    if (typeof rev !== 'string' || !GIT_REV.test(rev)) {
      fail(`rev must be a full 40-character lowercase hex commit id (got ${JSON.stringify(rev)})`);
    }
    return { source, rev: /** @type {string} */ (rev), upcoming: semver('upcoming') };
  }
  return { source, version: semver('version') };
}

/**
 * The version a page shows for a pin, and whether it is on the registries.
 *
 * @param {Pin} pin
 * @returns {{ version: string, published: boolean }}
 */
export function pinRelease(pin) {
  return pin.source === 'registry' ? { version: pin.version, published: true } : { version: pin.upcoming, published: false };
}

/**
 * The pin file that a page platform reads. Node.js and Web share one JS pin.
 *
 * @param {string} platform  rust, node, web, kotlin or swift.
 * @returns {PinPlatform}
 */
export function pinPlatformFor(platform) {
  switch (platform) {
    case 'rust':
    case 'kotlin':
    case 'swift':
      return platform;
    case 'node':
    case 'web':
      return 'js';
    default:
      throw new PinError(`${JSON.stringify(platform)} is not a platform; use one of rust, node, web, kotlin, swift`);
  }
}
