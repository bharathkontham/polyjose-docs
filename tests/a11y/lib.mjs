// Pure helpers for the accessibility runner (run.mjs). Unit-tested by
// scripts/check/a11y-lib.test.mjs.

/** WCAG 2.0, 2.1 and 2.2, levels A and AA. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Every <loc> URL in a sitemap, in document order. */
export function sitemapLocs(xml) {
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) =>
    m[1].trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => XML_ENTITIES[e]),
  );
  if (locs.length === 0) throw new Error('the sitemap has no <loc> entries');
  return locs;
}

/** The same path, query and hash on the local preview origin. */
export function toLocal(loc, origin) {
  const u = new URL(loc);
  return new URL(u.pathname + u.search + u.hash, origin).href;
}

const ALLOW_KEYS = new Set(['rule', 'selector', 'reason', 'issue']);

/**
 * Parses and validates tests/a11y/allow.json: an array of
 * `{ rule, selector, reason, issue? }`, where `rule` is an axe rule id,
 * `selector` is the node's target exactly as the runner prints it, and
 * `reason` says why the markup can't be fixed here.
 */
export function parseAllowList(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`allow.json is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(data)) throw new Error('allow.json must be an array of entries');
  const seen = new Set();
  data.forEach((entry, i) => {
    const where = `allow.json entry ${i}`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${where} must be an object`);
    for (const key of Object.keys(entry)) {
      if (!ALLOW_KEYS.has(key)) throw new Error(`${where} has unknown key "${key}"`);
    }
    for (const key of ['rule', 'selector', 'reason']) {
      if (typeof entry[key] !== 'string' || entry[key].trim() === '') {
        throw new Error(`${where} needs a non-empty "${key}"`);
      }
    }
    if (entry.issue !== undefined && typeof entry.issue !== 'string') throw new Error(`${where}: "issue" must be a URL string`);
    const id = `${entry.rule}\u0000${entry.selector}`;
    if (seen.has(id)) throw new Error(`${where} is a duplicate of an earlier entry (${entry.rule} ${entry.selector})`);
    seen.add(id);
  });
  return data;
}

/** An axe node's target as one string: frames joined by " |> ", shadow roots by " >>> ". */
export function selectorOf(node) {
  return node.target.map((part) => (Array.isArray(part) ? part.join(' >>> ') : part)).join(' |> ');
}

/**
 * Splits axe violations into failures and allowed nodes. `runs` is a list of
 * `{ page, variant, violations }`. Returns the failing nodes and the allow
 * entries that matched nothing in any run.
 */
export function applyAllowList(allow, runs) {
  const used = new Set();
  const failures = [];
  for (const { page, variant, violations } of runs) {
    for (const v of violations) {
      for (const node of v.nodes) {
        const selector = selectorOf(node);
        const entry = allow.find((e) => e.rule === v.id && e.selector === selector);
        if (entry) {
          used.add(entry);
        } else {
          failures.push({ page, variant, rule: v.id, impact: v.impact, selector, help: v.help, helpUrl: v.helpUrl });
        }
      }
    }
  }
  return { failures, unused: allow.filter((e) => !used.has(e)) };
}

/** The arrow keys that move a tab list's focus from tab `from` to tab `to`. */
export function arrowPresses(from, to) {
  const key = to > from ? 'ArrowRight' : 'ArrowLeft';
  return Array.from({ length: Math.abs(to - from) }, () => key);
}

// ---- waiting for wide code blocks to become keyboard-focusable --------------
//
// A region that scrolls horizontally must be reachable with the keyboard
// (WCAG 2.1.1 Keyboard; axe rule scrollable-region-focusable). Expressive Code
// does this in its client script ("Scrollable block tabindex" in
// @expressive-code/core): it gives every `.expressive-code pre` that is wider
// than its box tabindex="0". It does so from a debounced ResizeObserver
// callback, so the attribute arrives a few hundred milliseconds after the load
// event, and again whenever a hidden block (in an inactive tab panel) becomes
// visible. The runner therefore waits for that DOM state before every axe run.

/**
 * Upper bound, in milliseconds, of the wait before each axe run. The wait
 * ends as soon as the condition holds, so this is never slept.
 */
export const CODE_BLOCK_WAIT_MS = 10_000;

/**
 * Runs in the page: the Expressive Code blocks that scroll horizontally but
 * have no tabindex yet, each described as `code block N ("first line…")`.
 * Self-contained (no outside references), because Playwright sends its source
 * to the browser, where it is called without arguments.
 */
export function unfocusableCodeBlocks(root = document) {
  const max = 32; // characters of the first line shown in messages
  const out = [];
  [...root.querySelectorAll('.expressive-code pre')].forEach((pre, i) => {
    if (pre.scrollWidth <= pre.clientWidth || pre.hasAttribute('tabindex')) return;
    const text = pre.innerText ?? pre.textContent ?? '';
    const line = text.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? '';
    out.push(`code block ${i + 1} ("${line.length > max ? `${line.slice(0, max)}…` : line}")`);
  });
  return out;
}

/**
 * Waits until every wide Expressive Code block on `page` is keyboard-focusable
 * (see above), for at most `timeout` ms. Returns no problems once it holds, or
 * one problem naming the blocks if it times out, so the page fails instead of
 * being skipped. Pages without code blocks satisfy the condition at once.
 */
export async function waitForCodeBlocks(page, { timeout = CODE_BLOCK_WAIT_MS } = {}) {
  try {
    await page.waitForFunction(`(${unfocusableCodeBlocks})().length === 0`, undefined, { timeout });
    return [];
  } catch (err) {
    if (err?.name !== 'TimeoutError') throw err;
  }
  const pending = await page.evaluate(unfocusableCodeBlocks);
  return [
    `wide code blocks are still not keyboard-focusable after ${timeout} ms ` +
      `(Expressive Code did not add tabindex): ${pending.join(', ')}`,
  ];
}
