#!/usr/bin/env node
// ADR 0053: the brand exports are rendered by the Playwright Chromium that is
// already a devDependency, the ICO is written by the owned ./ico.mjs, and the
// outputs are committed. Builds, deploys and `npm run test:scripts` never run
// this; re-exporting needs `npx playwright install chromium` once.
//
// npm run brand:export [-- --src <dir>] [-- --out <dir>]
//
// For every entry of ./targets.mjs:
//   copy  copies the source SVG byte for byte;
//   png   loads the SVG into an <img> of exactly the target size on a page with
//         device scale factor 1 and screenshots that element;
//   ico   does the same at each frame size and packs the PNGs into one ICO.
// `opaque: false` targets are screenshotted with a transparent background
// (omitBackground); opaque ones on the page's white background.
// Prints one line per output: path, size, bytes.
//
// Options (for tests): --src <dir> (default brand/src), --out <dir> (default the
// repo root; outputs go to the target paths under it).
// Exit status: 0 done, 1 a source is missing or rendering failed, 2 usage error.
// Every source is checked before the browser is launched, so a missing source
// fails without one and nothing is written.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { TARGETS, SOURCES } from './targets.mjs';
import { encodeIco } from './ico.mjs';
import { readPngInfo } from './png-info.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

const USAGE = `usage: node scripts/brand/export.mjs [--src <dir>] [--out <dir>]
  --src <dir>  directory with the SVG sources (default: brand/src)
  --out <dir>  root the target paths are written under (default: the repo root)`;

/** A command-line error; the CLI exits with status 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/** A missing source or a failed render; the CLI exits with status 1. */
export class ExportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExportError';
  }
}

/**
 * Parses the command line. Relative paths resolve against the working
 * directory; the defaults are fixed to the repo.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ src: string, out: string, help: boolean }}
 */
export function parseArgs(argv) {
  const opts = { src: join(ROOT, 'brand', 'src'), out: ROOT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
      continue;
    }
    const m = /^--(src|out)(?:=(.*))?$/s.exec(arg);
    if (!m) throw new UsageError(`unknown argument ${JSON.stringify(arg)}`);
    let value = m[2];
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`--${m[1]} needs a directory`);
    }
    if (value === '') throw new UsageError(`--${m[1]} needs a directory`);
    opts[m[1]] = resolve(value);
  }
  return opts;
}

/**
 * Returns the source file names the targets need that are not regular files
 * in `srcDir`, in target order.
 */
export function missingSources(srcDir, sources = SOURCES) {
  return sources.filter((name) => {
    try {
      return !statSync(join(srcDir, name)).isFile();
    } catch {
      return true;
    }
  });
}

/** The output path for a target, refusing anything outside the output root. */
function outputPath(outRoot, target) {
  const path = resolve(outRoot, target.out);
  const rel = relative(outRoot, path);
  if (rel === '' || rel.startsWith('..') || rel.split(sep).includes('..')) {
    throw new ExportError(`${target.out}: output path leaves the output root`);
  }
  return path;
}

/** A page that shows only the SVG, as an <img> of exactly width x height CSS px. */
function imagePage(svg, width, height) {
  const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0}img{display:block}</style>' +
    `</head><body><img alt="" width="${width}" height="${height}" src="${src}"></body></html>`
  );
}

/**
 * Renders one SVG at width x height and returns the PNG bytes. Checks that the
 * image decoded and that the screenshot has exactly the requested size.
 */
async function render(page, { name, svg, width, height, opaque }) {
  await page.setContent(imagePage(svg, width, height), { waitUntil: 'load' });
  const img = page.locator('img');
  const decoded = await img.evaluate((el) => el.decode().then(
    () => el.naturalWidth > 0 && el.naturalHeight > 0,
    () => false,
  ));
  if (!decoded) throw new ExportError(`${name}: Chromium could not decode the SVG`);
  const png = await img.screenshot({
    type: 'png',
    omitBackground: !opaque,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
  const info = readPngInfo(png);
  if (info.width !== width || info.height !== height) {
    throw new ExportError(`${name}: rendered ${info.width}x${info.height}, expected ${width}x${height}`);
  }
  return png;
}

function sizeLabel(target) {
  if (target.kind === 'png') return `${target.width}x${target.height}`;
  if (target.kind === 'ico') return target.sizes.map((s) => `${s}x${s}`).join(',');
  return 'svg';
}

/**
 * Writes every target from `src` under `out` and returns one record per output.
 *
 * @param {{ src: string, out: string, targets?: readonly object[], log?: (line: string) => void }} opts
 */
export async function exportBrand({ src, out, targets = TARGETS, log = console.log }) {
  const sources = [...new Set(targets.map((t) => t.src))];
  const missing = missingSources(src, sources);
  if (missing.length > 0) {
    throw new ExportError(`missing source${missing.length > 1 ? 's' : ''} in ${src}: ${missing.join(', ')}`);
  }
  const svgs = new Map(sources.map((name) => [name, readFileSync(join(src, name))]));
  for (const target of targets) outputPath(out, target);

  // Loaded only once the sources are known to exist, so the checks above need
  // no browser.
  const { chromium } = await import('@playwright/test');
  const rasters = targets.filter((t) => t.kind !== 'copy');
  const viewport = {
    width: Math.max(1, ...rasters.flatMap((t) => (t.kind === 'ico' ? t.sizes : [t.width]))),
    height: Math.max(1, ...rasters.flatMap((t) => (t.kind === 'ico' ? t.sizes : [t.height]))),
  };

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    const reason = String(err?.message ?? err).split('\n')[0];
    throw new ExportError(`cannot launch Playwright Chromium (run \`npx playwright install chromium\`): ${reason}`);
  }
  const results = [];
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: 'light', // the favicon's @media dark block must not apply
      reducedMotion: 'reduce',
      forcedColors: 'none',
    });
    const page = await context.newPage();
    for (const target of targets) {
      const svg = svgs.get(target.src);
      let bytes;
      if (target.kind === 'copy') {
        bytes = svg;
      } else if (target.kind === 'png') {
        const { width, height, opaque } = target;
        bytes = await render(page, { name: target.src, svg, width, height, opaque });
      } else if (target.kind === 'ico') {
        const frames = [];
        for (const size of target.sizes) {
          const png = await render(page, { name: target.src, svg, width: size, height: size, opaque: target.opaque });
          frames.push({ size, png });
        }
        bytes = encodeIco(frames);
      } else {
        throw new ExportError(`${target.out}: unknown target kind ${JSON.stringify(target.kind)}`);
      }
      const path = outputPath(out, target);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
      const record = { out: target.out, size: sizeLabel(target), bytes: bytes.length };
      results.push(record);
      log(`${record.out}  ${record.size}  ${record.bytes} bytes`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return results;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`brand:export: ${err.message}\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (!existsSync(opts.src)) {
    console.error(`brand:export: missing sources: the source directory ${opts.src} does not exist`);
    return 1;
  }
  try {
    const results = await exportBrand(opts);
    console.log(`brand:export: wrote ${results.length} files under ${opts.out}`);
    return 0;
  } catch (err) {
    console.error(`brand:export: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
