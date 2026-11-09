// @ts-check
/**
 * Install snippets, generated from the pin files so no page hand-types a
 * package name or version.
 */

import { parsePin, pinRelease, PinError } from './pins.mjs';

/** Package coordinates on each registry. Changing one is a breaking change for readers. */
export const COORDINATES = Object.freeze({
  crate: 'polyjose',
  npmNode: '@polyjose/node',
  npmWasm: '@polyjose/wasm',
  mavenAndroid: 'dev.polyjose:polyjose',
  mavenJvm: 'dev.polyjose:polyjose-jvm',
  spmUrl: 'https://github.com/bharathkontham/polyjose',
  spmProduct: 'Polyjose',
});

/**
 * The public package pages for each platform. They are version-agnostic on
 * purpose: the pinned version is already in the install snippet, and these
 * links stay correct when the pin moves to a new release.
 *
 * @type {Readonly<Record<string, readonly { label: string, href: string }[]>>}
 */
export const REGISTRY_LINKS = Object.freeze({
  rust: Object.freeze([
    { label: 'crates.io', href: 'https://crates.io/crates/polyjose' },
    { label: 'docs.rs', href: 'https://docs.rs/polyjose' },
  ]),
  node: Object.freeze([{ label: 'npm', href: 'https://www.npmjs.com/package/@polyjose/node' }]),
  web: Object.freeze([{ label: 'npm', href: 'https://www.npmjs.com/package/@polyjose/wasm' }]),
  kotlin: Object.freeze([
    { label: 'Maven Central (Android)', href: 'https://central.sonatype.com/artifact/dev.polyjose/polyjose' },
    { label: 'Maven Central (JVM)', href: 'https://central.sonatype.com/artifact/dev.polyjose/polyjose-jvm' },
  ]),
  swift: Object.freeze([
    { label: 'GitHub releases', href: 'https://github.com/bharathkontham/polyjose/releases' },
  ]),
});

/**
 * @param {string} platform  rust, node, web, kotlin or swift.
 * @returns {readonly { label: string, href: string }[]} The package pages for that platform.
 */
export function registryLinks(platform) {
  const links = REGISTRY_LINKS[platform];
  if (links === undefined) {
    throw new PinError(`${JSON.stringify(platform)} is not a platform; use one of rust, node, web, kotlin, swift`);
  }
  return links;
}

/**
 * @typedef {{ title: string | undefined, lang: string, code: string }} Snippet
 * @typedef {{ version: string, published: boolean, snippets: Snippet[] }} Install
 */

/**
 * @param {string} platform  rust, node, web, kotlin or swift.
 * @param {unknown} pin      The platform's pin (validated here).
 * @returns {Install}
 */
export function installSnippets(platform, pin) {
  const { version, published } = pinRelease(parsePin(pin));
  const c = COORDINATES;
  /** @type {Snippet[]} */
  let snippets;
  switch (platform) {
    case 'rust':
      snippets = [{ title: undefined, lang: 'sh', code: `cargo add ${c.crate}@${version}` }];
      break;
    case 'node':
      snippets = [{ title: undefined, lang: 'sh', code: `npm install ${c.npmNode}@${version}` }];
      break;
    case 'web':
      snippets = [{ title: undefined, lang: 'sh', code: `npm install ${c.npmWasm}@${version}` }];
      break;
    case 'kotlin':
      snippets = [
        {
          title: 'build.gradle.kts (Android)',
          lang: 'kotlin',
          code: `dependencies {\n    implementation("${c.mavenAndroid}:${version}")\n}`,
        },
        {
          title: 'build.gradle.kts (JVM)',
          lang: 'kotlin',
          code: `dependencies {\n    implementation("${c.mavenJvm}:${version}")\n}`,
        },
      ];
      break;
    case 'swift':
      snippets = [
        {
          title: 'Package.swift',
          lang: 'swift',
          code: [
            'dependencies: [',
            `    .package(url: "${c.spmUrl}", from: "${version}"),`,
            '],',
            'targets: [',
            '    .target(',
            '        name: "MyApp",',
            '        dependencies: [',
            `            .product(name: "${c.spmProduct}", package: "polyjose"),`,
            '        ]',
            '    ),',
            ']',
          ].join('\n'),
        },
      ];
      break;
    default:
      throw new PinError(`${JSON.stringify(platform)} is not a platform; use one of rust, node, web, kotlin, swift`);
  }
  return { version, published, snippets };
}
