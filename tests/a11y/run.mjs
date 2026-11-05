#!/usr/bin/env node
// npm run a11y
//
// Serves the built site with Astro's preview server on an OS-assigned port and
// runs axe (WCAG 2.0, 2.1 and 2.2, levels A and AA) in Chromium on every page
// of dist/sitemap-0.xml, plus the 404 page:
//   - once in the light theme and once in the dark theme. The theme is stored
//     where Starlight's theme script reads it before first paint, and the run
//     checks that <html data-theme> took it and that the colours changed;
//   - on pages with a five-platform tab group, once more per theme after
//     switching to the Swift tab with the keyboard only (focus the selected
//     tab, then arrow keys), which also checks the tabs are keyboard operable.
// Any violation fails unless tests/a11y/allow.json lists its rule and selector
// with a reason; an allow entry that matches nothing fails too.
//
// The preview server runs in this process (Astro's programmatic preview API),
// so no server can outlive the run; it is also stopped explicitly on success,
// failure, error and on SIGINT/SIGTERM/SIGHUP.
//
// Options: --allow <file> uses another allow-list (for testing the runner).

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { preview } from 'astro';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { AXE_TAGS, sitemapLocs, toLocal, parseAllowList, applyAllowList, arrowPresses } from './lib.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const THEMES = ['light', 'dark'];
const THEME_STORAGE_KEY = 'starlight-theme'; // read by Starlight's ThemeProvider
const PLATFORM_SYNC_KEY = 'platform';
const PLATFORM_TAB_COUNT = 5;
const TARGET_TAB = 'Swift';
const CONCURRENCY = 4;

// ---- cleanup on every exit path -------------------------------------------

const cleanups = [];
let cleaning = null;
function stopAll() {
  cleaning ??= (async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      try {
        await fn();
      } catch (err) {
        console.error(`a11y: cleanup failed: ${err.message}`);
      }
    }
  })();
  return cleaning;
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.once(signal, () => {
    console.error(`\na11y: ${signal}, stopping the preview server`);
    stopAll().finally(() => process.exit(code));
  });
}

// ---- one page --------------------------------------------------------------

const analyze = (page) => new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();

/**
 * Switches every five-platform tab group on the page to the Swift tab using
 * only the keyboard. Returns the number of groups and any keyboard problems.
 */
async function switchPlatformTabs(page) {
  const groups = page.locator('starlight-tabs');
  const problems = [];
  let found = 0;
  for (let g = 0; g < (await groups.count()); g++) {
    const group = groups.nth(g);
    const tabs = group.locator('[role="tablist"]').first().locator('[role="tab"]');
    const labels = (await tabs.allTextContents()).map((s) => s.trim());
    const syncKey = await group.getAttribute('data-sync-key');
    const isPlatform =
      syncKey === PLATFORM_SYNC_KEY || (labels.length === PLATFORM_TAB_COUNT && labels.includes(TARGET_TAB));
    if (!isPlatform) continue;
    found++;
    const name = `platform tab group ${g + 1} (${labels.join(', ')})`;
    const target = labels.indexOf(TARGET_TAB);
    if (target === -1) {
      problems.push(`${name} has no ${TARGET_TAB} tab`);
      continue;
    }
    const selected = await tabs.evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-selected') === 'true'));
    const pressed = selected !== target;
    if (pressed) {
      await tabs.nth(selected).focus();
      for (const key of arrowPresses(selected, target)) await page.keyboard.press(key);
    }
    const state = await group.evaluate((el) => {
      const list = el.querySelector('[role="tablist"]');
      const all = [...list.querySelectorAll('[role="tab"]')];
      const panels = [...el.querySelectorAll(':scope > [role="tabpanel"]')];
      return {
        selected: all.map((t) => t.getAttribute('aria-selected') === 'true'),
        focused: all.indexOf(document.activeElement),
        visible: panels.map((p) => !p.hidden),
      };
    });
    const only = (flags) => flags.every((on, i) => on === (i === target));
    if (!only(state.selected)) problems.push(`${name}: the arrow keys did not select the ${TARGET_TAB} tab`);
    if (!only(state.visible)) problems.push(`${name}: the ${TARGET_TAB} panel is not the only visible panel`);
    if (pressed && state.focused !== target) problems.push(`${name}: focus did not follow the arrow keys`);
  }
  return { found, problems };
}

async function checkPage(browser, url) {
  const path = new URL(url).pathname;
  const runs = [];
  const problems = [];
  const colours = {};
  let tabGroups = 0;
  for (const theme of THEMES) {
    const context = await browser.newContext({ colorScheme: theme });
    try {
      await context.addInitScript(
        ([key, value]) => {
          try {
            localStorage.setItem(key, value);
          } catch {
            // Storage blocked: the colour scheme preference still selects the theme.
          }
        },
        [THEME_STORAGE_KEY, theme],
      );
      const page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'load' });
      if (!response?.ok()) {
        problems.push(`${theme}: HTTP ${response?.status() ?? 'no response'}`);
        continue;
      }
      const state = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        background: getComputedStyle(document.body).backgroundColor,
        text: getComputedStyle(document.body).color,
      }));
      if (state.theme !== theme) problems.push(`${theme}: <html data-theme> is "${state.theme}"`);
      colours[theme] = state;
      runs.push({ page: path, variant: theme, violations: (await analyze(page)).violations });

      const tabs = await switchPlatformTabs(page);
      tabGroups = tabs.found;
      problems.push(...tabs.problems.map((p) => `${theme}: ${p}`));
      if (tabs.found > 0) {
        runs.push({ page: path, variant: `${theme}, ${TARGET_TAB} tab`, violations: (await analyze(page)).violations });
      }
    } finally {
      await context.close();
    }
  }
  const { light, dark } = colours;
  if (light && dark && (light.background === dark.background || light.text === dark.text)) {
    problems.push(`the light and dark themes render the same colours (${light.background} on ${light.text})`);
  }
  return { path, runs, problems, tabGroups, colours };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

// ---- report ----------------------------------------------------------------

function report(pages, allow) {
  const { failures, unused } = applyAllowList(allow, pages.flatMap((p) => p.runs));
  let failedPages = 0;
  for (const p of pages) {
    const mine = failures.filter((f) => f.page === p.path);
    const counts = p.runs
      .map((r) => {
        const total = r.violations.reduce((n, v) => n + v.nodes.length, 0);
        const failing = mine.filter((f) => f.variant === r.variant).length;
        const allowed = total - failing;
        return `${r.variant} ${failing}${allowed ? ` (+${allowed} allowed)` : ''}`;
      })
      .join(' · ');
    const ok = mine.length === 0 && p.problems.length === 0;
    if (!ok) failedPages++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${p.path.padEnd(40)} ${counts}`);
    for (const f of mine) {
      console.log(`          [${f.variant}] ${f.rule} (${f.impact}) ${f.selector}`);
      console.log(`            ${f.help}: ${f.helpUrl}`);
    }
    for (const problem of p.problems) console.log(`          ${problem}`);
  }
  for (const e of unused) {
    console.log(`  FAIL  allow.json entry matches nothing, remove it: ${e.rule} ${e.selector}`);
  }
  const variants = pages.reduce((n, p) => n + p.runs.length, 0);
  const tabbed = pages.filter((p) => p.tabGroups > 0).length;
  console.log(
    `\na11y: ${pages.length} pages, ${variants} axe runs (${tabbed} pages with platform tabs), ` +
      `${failures.length} violation node(s), ${failedPages} failing page(s), ${unused.length} unused allow entr${unused.length === 1 ? 'y' : 'ies'}.`,
  );
  return failures.length === 0 && failedPages === 0 && unused.length === 0;
}

// ---- main ------------------------------------------------------------------

async function main(argv) {
  const at = argv.indexOf('--allow');
  const allowPath = at === -1 ? join(ROOT, 'tests/a11y/allow.json') : resolve(argv[at + 1]);
  const allow = parseAllowList(readFileSync(allowPath, 'utf8'));
  const sitemap = join(ROOT, 'dist/sitemap-0.xml');
  if (!existsSync(sitemap)) throw new Error('dist/sitemap-0.xml not found: run `npm run build` first.');
  const locs = sitemapLocs(readFileSync(sitemap, 'utf8'));

  const server = await preview({ root: ROOT, server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
  cleanups.push(() => server.stop());
  const origin = `http://127.0.0.1:${server.port}`;

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    throw new Error(`could not start Chromium (run \`npx playwright install chromium\`): ${err.message}`);
  }
  cleanups.push(() => browser.close());

  const urls = locs.map((loc) => toLocal(loc, origin));
  if (existsSync(join(ROOT, 'dist/404.html'))) urls.push(`${origin}/404.html`);
  console.log(`a11y: axe ${AXE_TAGS.join(', ')} on ${urls.length} pages via ${origin}`);
  const pages = await pool(urls, CONCURRENCY, (url) => checkPage(browser, url));
  return report(pages, allow) ? 0 : 1;
}

let code;
try {
  code = await main(process.argv.slice(2));
} catch (err) {
  console.error(`a11y: ${err.message}`);
  code = 2;
} finally {
  await stopAll();
}
process.exit(code);
