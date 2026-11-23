// Tests for the Markdown versions of the site: /llms.txt, /<slug>.md and
// /llms-full.txt.
//
// The unit tests run the MDX-to-Markdown mapping (src/lib/llms) on small
// inputs. The dist tests read the built site, so run `npm run build` first
// (`npm run verify` does); they are skipped without dist/llms.txt.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageMarkdown, MarkdownError } from '../../src/lib/llms/mdx.mjs';
import { markdownComponents } from '../../src/lib/llms/components.mjs';
import { SIDEBAR, orderPages } from '../../src/lib/llms/site.mjs';
import { collectRegions, isSampleSource } from '../../src/lib/samples/resolve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(root, 'dist');

/** Every file under `dir`, as paths relative to `base`. */
function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
  );
}

/** Text outside fenced code blocks and inline code. */
function prose(markdown) {
  return markdown.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, '').replace(/(`+)[^`]*?\1/g, '');
}

describe('MDX to Markdown', () => {
  const regions = collectRegions({
    'samples/rust/tests/a.rs': '// docs:start demo/one\nlet x: Vec<String> = vec![];\n// docs:end demo/one\n',
    'samples/js/a.test.mjs': "// docs:start demo/one\nimport { a } from '@polyjose/node';\n// docs:end demo/one\n",
    'samples/kotlin/A.kt': '// docs:start demo/one\nval x = 1\n// docs:end demo/one\n',
  });
  const reasons = { 'no-swift': 'Not in `Swift`.' };
  const components = markdownComponents({
    regions,
    reasons,
    pinFor: () => ({ source: 'registry', version: '1.2.3' }),
    algorithms: { groups: [] },
    errorCodes: { codes: [] },
    primitives: [],
    standards: { rfcs: [], errata: [] },
  });
  const md = (body) => pageMarkdown({ slug: 'guides/demo', title: 'Demo', description: 'A demo.', body }, components);

  test('maps the components, keeps code and makes links absolute', () => {
    const out = md(
      [
        "import Samples from '../../components/samples/Samples.astro';",
        "import { Aside, Badge, Tabs, TabItem } from '@astrojs/starlight/components';",
        '',
        '{/* a comment */}',
        'See [Errors](/concepts/errors/), [below](#later) and <a href="/start/rust/">Rust</a>. `Result<String>` and <code>{\'Vec<u8>\'}</code>.',
        '',
        '<Samples id="demo/one" unavailable={{ swift: "no-swift" }} />',
        '',
        '<Aside type="caution" title="Careful">',
        'Mind <Badge text="beta" />.',
        '</Aside>',
        '',
        '<Tabs syncKey="platform">',
        '<TabItem label="Kotlin">',
        '',
        '```kotlin',
        'import dev.polyjose.*',
        'val list: List<String> = listOf() // { not an expression',
        '```',
        '',
        '</TabItem>',
        '</Tabs>',
      ].join('\n'),
    );
    assert.ok(out.startsWith('# Demo\n\n> A demo.\n\n'), out);
    assert.match(out, /\[Errors\]\(https:\/\/polyjose\.dev\/concepts\/errors\/\)/);
    assert.match(out, /\[below\]\(https:\/\/polyjose\.dev\/guides\/demo\/#later\)/);
    assert.match(out, /<a href="https:\/\/polyjose\.dev\/start\/rust\/">/);
    assert.match(out, /`Result<String>` and <code>Vec&lt;u8&gt;<\/code>/);
    assert.ok(out.includes('**Rust**\n\n```rust\nlet x: Vec<String> = vec![];\n```'), out);
    assert.ok(out.includes("**Web**\n\n```js\nimport { a } from '@polyjose/wasm';\n```"), out);
    assert.ok(out.includes('**Swift**\n\n> **Not available in Swift**\n>\n> Not in `Swift`.'), out);
    assert.ok(out.includes('> **Careful**\n>\n> Mind (beta).'), out);
    assert.ok(out.includes('**Kotlin**\n\n```kotlin\nimport dev.polyjose.*\nval list: List<String>'), out);
    assert.doesNotMatch(out, /a comment|Samples\.astro|@astrojs\/starlight/);
  });

  test('an unknown component fails, naming the page and the tag', () => {
    assert.throws(() => md('Text.\n\n<Steps>\n1. one\n</Steps>\n'), (err) => {
      assert.ok(err instanceof MarkdownError);
      assert.match(err.message, /guides\/demo/);
      assert.match(err.message, /<Steps>/);
      return true;
    });
  });

  test('an unknown expression fails, naming the page', () => {
    assert.throws(() => md('{data.items.map((x) => x)}\n'), /guides\/demo: no Markdown for the expression \{data\.items/);
  });

  test('a page missing from the sidebar order fails', () => {
    const pages = ['index', ...SIDEBAR.flatMap((g) => g.slugs), 'guides/new'].map((slug) => ({ slug }));
    assert.throws(() => orderPages(pages), /not listed: guides\/new/);
  });

  test('the sidebar order matches astro.config.mjs', () => {
    const config = readFileSync(join(root, 'astro.config.mjs'), 'utf8');
    const sidebar = config.slice(config.indexOf('const sidebar = ['), config.indexOf('\n];', config.indexOf('const sidebar = [')));
    const slugs = [...sidebar.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(SIDEBAR.flatMap((g) => g.slugs), slugs);
    const groups = [...sidebar.matchAll(/^(?: {4}| {2}\{ )label: '([^']+)'/gm)].map((m) => m[1]);
    assert.deepEqual(SIDEBAR.map((g) => g.label), groups);
  });
});

describe('built Markdown (dist/)', { skip: !existsSync(join(dist, 'llms.txt')) && 'run `npm run build` first' }, () => {
  const read = (path) => readFileSync(join(dist, path), 'utf8');
  const pages = walk(join(root, 'src/content/docs')).filter((f) => f.endsWith('.mdx'));
  const llms = () => read('llms.txt');
  const linked = () => [...llms().matchAll(/\]\(https:\/\/polyjose\.dev\/([^)]+\.md)\)/g)].map((m) => m[1]);

  test('llms.txt links every page, and each linked file exists', () => {
    assert.equal(pages.length, 32);
    const links = linked();
    assert.equal(new Set(links).size, pages.length, links.join('\n'));
    for (const link of links) assert.ok(existsSync(join(dist, link)), `missing dist/${link}`);
    assert.match(llms(), /^# polyjose\n\n> \S/);
    assert.match(llms(), /\n## Optional\n\n(- \[[^\]]+\]\(https:\/\/\S+\)\n)+$/);
  });

  test('no Markdown file has a component tag or an import line outside code', () => {
    const files = walk(dist).filter((f) => f.endsWith('.md'));
    assert.equal(files.length, pages.length);
    for (const file of files) {
      const text = prose(read(file));
      assert.doesNotMatch(text, /<[A-Z]/, file);
      assert.doesNotMatch(text, /^\s*(?:import|export)\s/m, file);
    }
  });

  test('start/rust.md shows the Rust code of the page\'s first sample region', () => {
    const mdx = readFileSync(join(root, 'src/content/docs/start/rust.mdx'), 'utf8');
    const id = /<Sample platform="rust" id="([^"]+)"/.exec(mdx)?.[1];
    assert.ok(id, 'start/rust.mdx has no <Sample platform="rust">');
    const files = Object.fromEntries(
      walk(join(root, 'samples/rust'))
        .map((f) => `samples/rust/${f}`)
        .filter(isSampleSource)
        .map((f) => [f, readFileSync(join(root, f), 'utf8')]),
    );
    const region = collectRegions(files).rust.get(id);
    assert.ok(region, `no Rust region ${id}`);
    assert.ok(read('start/rust.md').includes(`\`\`\`rust\n${region.code}\n\`\`\``), `start/rust.md lacks region ${id}`);
  });

  test('llms-full.txt is every page in llms.txt order, separated by rules', () => {
    const expected = linked().map((link) => read(link).trim()).join('\n\n---\n\n');
    assert.equal(read('llms-full.txt'), `${expected}\n`);
  });

  test('the sitemap lists no Markdown or text files', () => {
    assert.doesNotMatch(read('sitemap-0.xml'), /\.(?:md|txt)</);
  });
});
