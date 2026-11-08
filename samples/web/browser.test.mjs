// Runs the browser samples of samples/web in headless Chromium. Not shown on any page.
//
// scripts/samples/platforms/js.sh compiles start/page.ts and start/worker.ts with the site's
// TypeScript into SAMPLES_WEB_BUILD, installs @polyjose/wasm into samples/js/node_modules (linked
// here as node_modules), then runs this file. A local HTTP server serves:
//   /start/page.html  a page that loads /start/page.js
//   /start/*.js       the compiled samples, with the `@polyjose/wasm` specifier resolved to the
//                     package's `browser` entry, /pkg/browser.mjs, as a bundler resolves it
//   /pkg/*            the installed @polyjose/wasm package, the .wasm as application/wasm
//   /fixtures/*       samples/fixtures
// Every response carries a Content Security Policy. The samples run under one that allows
// 'wasm-unsafe-eval' and nothing else beyond 'self'; /strict.html has one without it, which must
// make the first call reject (the CSP note on Get started › Web (WASM)).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const build = process.env.SAMPLES_WEB_BUILD;
assert.ok(build, 'SAMPLES_WEB_BUILD is not set; run scripts/samples/run.sh js');

const here = fileURLToPath(new URL('.', import.meta.url));
const roots = {
  '/start/': resolve(build, 'start'),
  '/pkg/': resolve(here, 'node_modules/@polyjose/wasm'),
  '/fixtures/': resolve(here, '../fixtures'),
};
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'";
const STRICT_CSP = "default-src 'self'; script-src 'self'";
/** Empty pages for the CSP check: the same call, with and without 'wasm-unsafe-eval'. */
const BLANK = new Set(['/blank.html', '/strict.html']);
const PAGE = '<!doctype html><html lang="en"><meta charset="utf-8"><title>polyjose samples</title><body><script type="module" src="/start/page.js"></script></body></html>';

/** Serves the file under one of `roots`, or null. Paths can't leave their root. */
async function load(pathname) {
  for (const [prefix, dir] of Object.entries(roots)) {
    if (!pathname.startsWith(prefix)) continue;
    const file = resolve(dir, decodeURIComponent(pathname.slice(prefix.length)));
    if (!file.startsWith(dir + sep)) return null;
    let body = await readFile(file).catch(() => null);
    if (body === null) return null;
    if (prefix === '/start/' && file.endsWith('.js')) {
      body = body.toString('utf8').replace(/(\bfrom\s*|\bimport\s*\(\s*)(["'])@polyjose\/wasm\2/g, '$1$2/pkg/browser.mjs$2');
    }
    return { body, type: TYPES[extname(file)] ?? 'application/octet-stream' };
  }
  return null;
}

let server;
let origin;
let browser;

before(async () => {
  server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const html = pathname === '/start/page.html' ? PAGE : BLANK.has(pathname) ? '<!doctype html><title>blank</title>' : null;
    const file = html === null ? await load(pathname) : { body: html, type: 'text/html; charset=utf-8' };
    if (file === null) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': file.type, 'Content-Security-Policy': pathname === '/strict.html' ? STRICT_CSP : CSP });
    res.end(file.body);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await new Promise((done) => server?.close(done));
});

test('the Web Worker sample signs in a worker, and the page verifies the token', async () => {
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  await page.goto(`${origin}/start/page.html`);
  const handle = await page.waitForFunction(() => document.body.dataset.result ?? document.body.dataset.error, null, {
    timeout: 60_000,
  });
  const outcome = await handle.jsonValue();
  const error = await page.evaluate(() => document.body.dataset.error);
  assert.equal(error, undefined, `the page failed: ${error}\n${problems.join('\n')}`);
  assert.deepEqual(JSON.parse(outcome), { alg: 'ES256', payload: 'hello, polyjose' });
  assert.deepEqual(problems, []);
  await page.close();
});

/** Loads the package's browser entry on `path` and makes one call. */
async function firstCall(path) {
  const page = await browser.newPage();
  await page.goto(`${origin}${path}`);
  const outcome = await page.evaluate(async () => {
    const polyjose = await import('/pkg/browser.mjs');
    try {
      const key = await polyjose.jwkGenerateEc('P-256');
      return `resolved: ${key.crv}`;
    } catch (err) {
      return `rejected: ${err}`;
    }
  });
  await page.close();
  return outcome;
}

test("the first call needs 'wasm-unsafe-eval' in the page's CSP", async () => {
  assert.equal(await firstCall('/blank.html'), 'resolved: P-256');
  assert.match(await firstCall('/strict.html'), /^rejected: /);
});
