// Integration test for scripts/samples/run.sh, with stub platform runners.
// On macOS this runs the script under /bin/bash, which is bash 3.2.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, lstatSync, readlinkSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN = fileURLToPath(new URL('../run.sh', import.meta.url));
const STUBS = fileURLToPath(new URL('./stubs/', import.meta.url));
const BASH = existsSync('/bin/bash') ? '/bin/bash' : 'bash';
const PLATFORMS = ['rust', 'js', 'kotlin', 'swift'];
const NONE = { source: 'none', upcoming: '0.1.0' };
const REGISTRY = { source: 'registry', version: '0.1.0' };

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** An environment without the CI flag or any variable the script reads. */
function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'CI' || key.startsWith('SAMPLES_') || key.startsWith('POLYJOSE_') || key.startsWith('GIT_')) delete env[key];
  }
  return { ...env, ...extra };
}

/**
 * A docs tree in a temp dir: `<tmp>/docs` with pins and runners, and an
 * optional sibling polyjose checkout at `<tmp>/polyjose`.
 */
function docsTree({ pins = {}, runners = {} } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'samples-run-')));
  temps.push(base);
  const docs = join(base, 'docs');
  mkdirSync(join(docs, 'samples/pins'), { recursive: true });
  mkdirSync(join(docs, 'scripts/samples/platforms'), { recursive: true });
  for (const platform of PLATFORMS) {
    const pin = platform in pins ? pins[platform] : NONE;
    if (pin === null) continue;
    writeFileSync(join(docs, `samples/pins/${platform}.json`), typeof pin === 'string' ? pin : JSON.stringify(pin));
  }
  for (const [platform, stub] of Object.entries(runners)) {
    copyFileSync(join(STUBS, `${stub}.sh`), join(docs, `scripts/samples/platforms/${platform}.sh`));
  }
  return { base, docs };
}

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    env: cleanEnv({
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    }),
  }).trim();
}

/** A git repository with two commits; returns both commit ids. */
function polyjoseRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'README.md'), 'one\n');
  git(dir, 'add', 'README.md');
  git(dir, 'commit', '-q', '-m', 'one');
  const first = git(dir, 'rev-parse', 'HEAD');
  writeFileSync(join(dir, 'README.md'), 'two\n');
  git(dir, 'commit', '-q', '-am', 'two');
  const second = git(dir, 'rev-parse', 'HEAD');
  return { first, second };
}

function run(args, { docs, env = {} } = {}) {
  const result = spawnSync(BASH, [RUN, ...args], {
    encoding: 'utf8',
    env: cleanEnv(docs ? { SAMPLES_ROOT: docs, ...env } : env),
  });
  return { status: result.status, out: result.stdout, err: result.stderr, lines: result.stdout.split('\n') };
}

const resultLines = (out) => out.split('\n').filter((l) => /^(PASS|FAIL|SKIPPED) \(/.test(l));

test('on the real tree every platform is skipped and nothing passes', () => {
  const r = run(['all']);
  assert.equal(r.status, 0, r.err);
  assert.deepEqual(resultLines(r.out), [
    'SKIPPED (rust: no polyjose build pinned)',
    'SKIPPED (js: no polyjose build pinned)',
    'SKIPPED (kotlin: no polyjose build pinned)',
    'SKIPPED (swift: no polyjose build pinned)',
  ]);
  assert.doesNotMatch(r.out + r.err, /PASS/);
});

test('one platform can be run on its own', () => {
  const r = run(['kotlin']);
  assert.equal(r.status, 0);
  assert.deepEqual(resultLines(r.out), ['SKIPPED (kotlin: no polyjose build pinned)']);
});

test('a none pin skips the platform without running its runner', () => {
  const { docs } = docsTree({ runners: { rust: 'pass' } });
  const r = run(['rust'], { docs });
  assert.equal(r.status, 0);
  assert.deepEqual(resultLines(r.out), ['SKIPPED (rust: no polyjose build pinned)']);
  assert.doesNotMatch(r.out, /runner ran/);
});

test('a pinned platform without a runner is skipped', () => {
  const { docs } = docsTree({ pins: { js: REGISTRY } });
  const r = run(['js'], { docs });
  assert.equal(r.status, 0);
  assert.deepEqual(resultLines(r.out), ['SKIPPED (js: runner not installed)']);
  assert.doesNotMatch(r.out, /PASS/);
});

test('registry mode sources the runner from the docs root with the pin in the environment', () => {
  const { docs } = docsTree({ pins: { rust: { source: 'registry', version: '1.2.3' } }, runners: { rust: 'pass' } });
  const r = run(['rust'], { docs });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['PASS (rust)']);
  assert.match(r.out, /runner ran: rust/);
  assert.match(r.out, new RegExp(`cwd=${docs}\n`));
  assert.match(r.out, new RegExp(`SAMPLES_ROOT=${docs}\n`));
  assert.match(r.out, /SAMPLES_PIN_SOURCE=registry\n/);
  assert.match(r.out, /SAMPLES_PIN_REV=\n/);
  assert.match(r.out, /SAMPLES_PIN_VERSION=1\.2\.3\n/);
  assert.match(r.out, new RegExp(`SAMPLES_WORK_DIR=${docs}/samples/\\.polyjose\n`));
  assert.match(r.out, /POLYJOSE_DIR=\n/);
});

test('a failing runner is a FAIL and the exit status is 1', () => {
  const { docs } = docsTree({ pins: { swift: REGISTRY }, runners: { swift: 'fail' } });
  const r = run(['swift'], { docs });
  assert.equal(r.status, 1);
  assert.deepEqual(resultLines(r.out), ['FAIL (swift: runner exited with status 1)']);
  assert.doesNotMatch(r.out, /not reached/);
});

test('runners run with set -u', () => {
  const { docs } = docsTree({ pins: { swift: REGISTRY }, runners: { swift: 'unset-var' } });
  const r = run(['swift'], { docs });
  assert.equal(r.status, 1);
  assert.match(resultLines(r.out)[0], /^FAIL \(swift: /);
});

test('a runner can skip itself with a reason', () => {
  const { docs } = docsTree({ pins: { kotlin: REGISTRY }, runners: { kotlin: 'skip' } });
  const r = run(['kotlin'], { docs });
  assert.equal(r.status, 0);
  assert.deepEqual(resultLines(r.out), ['SKIPPED (kotlin: toolchain not found)']);
  assert.doesNotMatch(r.out, /not reached/);
});

test('all reports each platform and fails when any platform fails', () => {
  const { docs } = docsTree({
    pins: { rust: REGISTRY, js: REGISTRY, kotlin: REGISTRY, swift: NONE },
    runners: { rust: 'pass', js: 'fail', swift: 'pass' },
  });
  const r = run(['all'], { docs });
  assert.equal(r.status, 1);
  assert.deepEqual(resultLines(r.out), [
    'PASS (rust)',
    'FAIL (js: runner exited with status 1)',
    'SKIPPED (kotlin: runner not installed)',
    'SKIPPED (swift: no polyjose build pinned)',
  ]);
});

test('an invalid or missing pin is a FAIL', () => {
  const { docs } = docsTree({ pins: { rust: { source: 'git', rev: 'main', upcoming: '0.1.0' }, js: null, kotlin: '{ not json' } });
  const r = run(['all'], { docs });
  assert.equal(r.status, 1);
  const lines = resultLines(r.out);
  assert.match(lines[0], /^FAIL \(rust: samples\/pins\/rust\.json: rev must be a full 40-character/);
  assert.match(lines[1], /^FAIL \(js: samples\/pins\/js\.json is missing/);
  assert.match(lines[2], /^FAIL \(kotlin: samples\/pins\/kotlin\.json is not valid JSON/);
  assert.equal(lines[3], 'SKIPPED (swift: no polyjose build pinned)');
});

test('an unknown platform prints the usage and exits 2', () => {
  for (const args of [['android'], [], ['rust', 'js']]) {
    const r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.err, /Usage: scripts\/samples\/run\.sh <rust\|js\|kotlin\|swift\|all>/);
  }
});

test('git mode uses the sibling ../polyjose checkout at the pinned commit', () => {
  const { base, docs } = docsTree({ runners: { rust: 'pass' } });
  const sibling = join(base, 'polyjose');
  const { second } = polyjoseRepo(sibling);
  writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify({ source: 'git', rev: second, upcoming: '0.1.0' }));
  const r = run(['rust'], { docs });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['PASS (rust)']);
  const link = join(docs, 'samples/.polyjose/polyjose');
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(readlinkSync(link), sibling);
  assert.match(r.out, new RegExp(`POLYJOSE_DIR=${link}\n`));
  assert.match(r.out, new RegExp(`SAMPLES_PIN_REV=${second}\n`));
  assert.match(r.out, /SAMPLES_PIN_VERSION=0\.1\.0\n/);
  assert.match(r.out, new RegExp(`POLYJOSE_HEAD=${second}\n`));
  // A second run reuses the link.
  assert.equal(run(['rust'], { docs }).status, 0);
});

test('git mode skips when there is no sibling checkout', () => {
  const rev = 'a'.repeat(40);
  const { docs } = docsTree({ pins: { js: { source: 'git', rev, upcoming: '0.1.0' } }, runners: { js: 'pass' } });
  const r = run(['js'], { docs });
  assert.equal(r.status, 0);
  assert.deepEqual(resultLines(r.out), ['SKIPPED (js: no polyjose checkout at ../polyjose; clone it next to the docs repository)']);
  assert.doesNotMatch(r.out, /runner ran/);
});

test('git mode skips when the sibling is at another commit', () => {
  const { base, docs } = docsTree({ runners: { rust: 'pass' } });
  const { first, second } = polyjoseRepo(join(base, 'polyjose'));
  writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify({ source: 'git', rev: first, upcoming: '0.1.0' }));
  const r = run(['rust'], { docs });
  assert.equal(r.status, 0);
  assert.deepEqual(resultLines(r.out), [
    `SKIPPED (rust: ../polyjose is at ${second.slice(0, 12)}, not the pinned ${first.slice(0, 12)}; check out the pinned commit)`,
  ]);
  assert.doesNotMatch(r.out, /runner ran/);
});

test('git mode skips when the sibling has uncommitted changes', () => {
  const { base, docs } = docsTree({ runners: { rust: 'pass' } });
  const sibling = join(base, 'polyjose');
  const { second } = polyjoseRepo(sibling);
  writeFileSync(join(sibling, 'README.md'), 'changed\n');
  writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify({ source: 'git', rev: second, upcoming: '0.1.0' }));
  const r = run(['rust'], { docs });
  assert.equal(r.status, 0);
  assert.deepEqual(resultLines(r.out), ['SKIPPED (rust: ../polyjose has uncommitted changes)']);
});

/** A sibling ../polyjose whose committed .gitignore ignores target/; returns its HEAD. */
function siblingWithIgnores(base) {
  const sibling = join(base, 'polyjose');
  polyjoseRepo(sibling);
  writeFileSync(join(sibling, '.gitignore'), 'target/\n');
  git(sibling, 'add', '.gitignore');
  git(sibling, 'commit', '-q', '-m', 'ignore build output');
  return { sibling, head: git(sibling, 'rev-parse', 'HEAD') };
}

test('git mode does not count files the sibling checkout ignores', () => {
  const { base, docs } = docsTree({ runners: { rust: 'pass' } });
  const { sibling, head } = siblingWithIgnores(base);
  mkdirSync(join(sibling, 'target/debug'), { recursive: true });
  writeFileSync(join(sibling, 'target/debug/build.log'), 'build output\n');
  writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify({ source: 'git', rev: head, upcoming: '0.1.0' }));
  const r = run(['rust'], { docs });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['PASS (rust)']);
});

test('git mode skips when the sibling has untracked files that are not ignored', () => {
  const { base, docs } = docsTree({ runners: { rust: 'pass' } });
  const { sibling, head } = siblingWithIgnores(base);
  writeFileSync(join(sibling, 'extra.rs'), 'pub fn extra() {}\n');
  writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify({ source: 'git', rev: head, upcoming: '0.1.0' }));
  const r = run(['rust'], { docs });
  assert.equal(r.status, 0);
  assert.deepEqual(resultLines(r.out), ['SKIPPED (rust: ../polyjose has uncommitted changes)']);
  assert.doesNotMatch(r.out, /runner ran/);
});

test('git mode skips, never passes, when git status fails in the sibling', () => {
  const { base, docs } = docsTree({ runners: { rust: 'pass' } });
  const sibling = join(base, 'polyjose');
  const { second } = polyjoseRepo(sibling);
  // A corrupt index: rev-parse HEAD still works, git status exits non-zero.
  writeFileSync(join(sibling, '.git/index'), 'not an index');
  writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify({ source: 'git', rev: second, upcoming: '0.1.0' }));
  const r = run(['rust'], { docs });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['SKIPPED (rust: could not read the state of ../polyjose: git status failed)']);
  assert.doesNotMatch(r.out, /runner ran|PASS/);
});

test('with CI=true git mode clones polyjose into samples/.polyjose/polyjose at the pinned commit', () => {
  const { base, docs } = docsTree({ runners: { kotlin: 'pass' } });
  const upstream = join(base, 'upstream');
  const { first } = polyjoseRepo(upstream);
  // The pin is not the tip of any branch; GitHub serves such commits, a local repository needs this setting.
  git(upstream, 'config', 'uploadpack.allowReachableSHA1InWant', 'true');
  writeFileSync(join(docs, 'samples/pins/kotlin.json'), JSON.stringify({ source: 'git', rev: first, upcoming: '0.1.0' }));
  const env = { CI: 'true', POLYJOSE_GIT_URL: `file://${upstream}` };
  const r = run(['kotlin'], { docs, env });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['PASS (kotlin)']);
  const clone = join(docs, 'samples/.polyjose/polyjose');
  assert.ok(lstatSync(clone).isDirectory());
  assert.equal(git(clone, 'rev-parse', 'HEAD'), first);
  assert.match(r.out, new RegExp(`POLYJOSE_HEAD=${first}\n`));
  // Running again reuses the clone.
  const again = run(['kotlin'], { docs, env });
  assert.equal(again.status, 0, again.out + again.err);
});

/** A throwaway upstream polyjose that serves any reachable commit; returns its commits. */
function upstreamRepo(dir) {
  const commits = polyjoseRepo(dir);
  git(dir, 'config', 'uploadpack.allowReachableSHA1InWant', 'true');
  return commits;
}

test('with CI=true a git pin runs the runner even when ../polyjose is dirty and elsewhere', () => {
  const { base, docs } = docsTree({ runners: { js: 'pass' } });
  // A sibling that the local path would skip: another history, uncommitted and untracked changes.
  const sibling = join(base, 'polyjose');
  polyjoseRepo(sibling);
  writeFileSync(join(sibling, 'README.md'), 'changed\n');
  writeFileSync(join(sibling, 'untracked.txt'), 'x\n');
  const upstream = join(base, 'upstream');
  const { first } = upstreamRepo(upstream);
  writeFileSync(join(docs, 'samples/pins/js.json'), JSON.stringify({ source: 'git', rev: first, upcoming: '0.1.0' }));
  const env = { CI: 'true', POLYJOSE_GIT_URL: `file://${upstream}` };
  const clone = join(docs, 'samples/.polyjose/polyjose');

  const r = run(['js'], { docs, env });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['PASS (js)']);
  assert.match(r.out, /runner ran: js/);
  assert.match(r.out, new RegExp(`POLYJOSE_DIR=${clone}\n`));
  assert.ok(!lstatSync(clone).isSymbolicLink());

  // What a runner leaves in the clone does not stop the next run.
  mkdirSync(join(clone, 'target'), { recursive: true });
  writeFileSync(join(clone, 'target/out.o'), 'build output\n');
  writeFileSync(join(clone, 'generated.d.ts'), 'export {};\n');
  const again = run(['js'], { docs, env });
  assert.equal(again.status, 0, again.out + again.err);
  assert.deepEqual(resultLines(again.out), ['PASS (js)']);
  assert.match(again.out, new RegExp(`POLYJOSE_HEAD=${first}\n`));
});

test('with CI=true a reused clone is reset to the pinned commit, discarding edits to tracked files', () => {
  const { base, docs } = docsTree({ runners: { kotlin: 'pass' } });
  const upstream = join(base, 'upstream');
  const { first } = upstreamRepo(upstream);
  writeFileSync(join(docs, 'samples/pins/kotlin.json'), JSON.stringify({ source: 'git', rev: first, upcoming: '0.1.0' }));
  const env = { CI: 'true', POLYJOSE_GIT_URL: `file://${upstream}` };
  const clone = join(docs, 'samples/.polyjose/polyjose');
  assert.equal(run(['kotlin'], { docs, env }).status, 0);

  writeFileSync(join(clone, 'README.md'), 'edited by an earlier run\n');
  const r = run(['kotlin'], { docs, env });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['PASS (kotlin)']);
  assert.equal(readFileSync(join(clone, 'README.md'), 'utf8'), 'one\n');
  assert.equal(git(clone, 'status', '--porcelain', '--untracked-files=no'), '');
});

test('with CI=true a reused clone whose origin is stale is pointed at the configured URL', () => {
  const { base, docs } = docsTree({ runners: { rust: 'pass' } });
  const old = join(base, 'old-upstream');
  const current = join(base, 'upstream');
  const { second: oldRev } = upstreamRepo(old);
  const { first: rev } = upstreamRepo(current);
  const pin = (r) => writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify({ source: 'git', rev: r, upcoming: '0.1.0' }));
  const clone = join(docs, 'samples/.polyjose/polyjose');

  pin(oldRev);
  const first = run(['rust'], { docs, env: { CI: 'true', POLYJOSE_GIT_URL: `file://${old}` } });
  assert.equal(first.status, 0, first.out + first.err);
  assert.equal(git(clone, 'remote', 'get-url', 'origin'), `file://${old}`);

  // Same clone, new URL and a commit only the new upstream has.
  pin(rev);
  const r = run(['rust'], { docs, env: { CI: 'true', POLYJOSE_GIT_URL: `file://${current}` } });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['PASS (rust)']);
  assert.equal(git(clone, 'remote', 'get-url', 'origin'), `file://${current}`);
  assert.equal(git(clone, 'rev-parse', 'HEAD'), rev);
});

test('with CI=true a reused clone without an origin remote gets one', () => {
  const { base, docs } = docsTree({ runners: { rust: 'pass' } });
  const upstream = join(base, 'upstream');
  const { first } = upstreamRepo(upstream);
  writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify({ source: 'git', rev: first, upcoming: '0.1.0' }));
  const clone = join(docs, 'samples/.polyjose/polyjose');
  mkdirSync(clone, { recursive: true });
  git(clone, 'init', '-q');
  const r = run(['rust'], { docs, env: { CI: 'true', POLYJOSE_GIT_URL: `file://${upstream}` } });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(resultLines(r.out), ['PASS (rust)']);
  assert.equal(git(clone, 'remote', 'get-url', 'origin'), `file://${upstream}`);
});

test('with CI=true a failed clone is a FAIL', () => {
  const { base, docs } = docsTree({
    pins: { swift: { source: 'git', rev: 'b'.repeat(40), upcoming: '0.1.0' } },
    runners: { swift: 'pass' },
  });
  const r = run(['swift'], { docs, env: { CI: 'true', POLYJOSE_GIT_URL: `file://${join(base, 'missing')}` } });
  assert.equal(r.status, 1);
  assert.match(resultLines(r.out)[0], /^FAIL \(swift: could not fetch polyjose bbbbbbbbbbbb/);
  assert.doesNotMatch(r.out, /runner ran/);
});

// Under CI=true a platform with a git or registry pin must run: every way it
// could be skipped is a FAIL. Only a none pin may still be SKIPPED there.
const CI_RULE = 'a pinned platform must run when CI=true';
const gitPin = (rev = 'a'.repeat(40)) => ({ source: 'git', rev, upcoming: '0.1.0' });

test('with CI=true git-pinned platforms without a runner fail, none pins stay skipped', () => {
  // The review's reproduction: rust and js pinned to a commit, no runners.
  const { base, docs } = docsTree({ pins: { rust: gitPin(), js: gitPin() } });
  const r = run(['all'], { docs, env: { CI: 'true', POLYJOSE_GIT_URL: `file://${join(base, 'missing')}` } });
  assert.equal(r.status, 1, r.out + r.err);
  assert.deepEqual(resultLines(r.out), [
    `FAIL (rust: runner not installed; ${CI_RULE})`,
    `FAIL (js: runner not installed; ${CI_RULE})`,
    'SKIPPED (kotlin: no polyjose build pinned)',
    'SKIPPED (swift: no polyjose build pinned)',
  ]);
  assert.doesNotMatch(r.out, /PASS|SKIPPED \((rust|js):/);
});

test('with CI=true a registry-pinned platform without a runner fails', () => {
  const { docs } = docsTree({ pins: { kotlin: REGISTRY } });
  const r = run(['kotlin'], { docs, env: { CI: 'true' } });
  assert.equal(r.status, 1, r.out + r.err);
  assert.deepEqual(resultLines(r.out), [`FAIL (kotlin: runner not installed; ${CI_RULE})`]);
});

test('with CI=true none pins are still skipped and the run exits 0', () => {
  const { docs } = docsTree({ runners: { rust: 'pass', swift: 'skip' } });
  const r = run(['all'], { docs, env: { CI: 'true' } });
  assert.equal(r.status, 0, r.out + r.err);
  assert.deepEqual(
    resultLines(r.out),
    PLATFORMS.map((p) => `SKIPPED (${p}: no polyjose build pinned)`),
  );
  assert.doesNotMatch(r.out, /runner ran|PASS|FAIL/);
});

test('with CI=true a registry-pinned runner that skips itself fails with its reason', () => {
  const { docs } = docsTree({ pins: { kotlin: REGISTRY, swift: REGISTRY }, runners: { kotlin: 'skip', swift: 'pass' } });
  const r = run(['all'], { docs, env: { CI: 'true' } });
  assert.equal(r.status, 1, r.out + r.err);
  assert.deepEqual(resultLines(r.out), [
    'SKIPPED (rust: no polyjose build pinned)',
    'SKIPPED (js: no polyjose build pinned)',
    `FAIL (kotlin: toolchain not found; ${CI_RULE})`,
    'PASS (swift)',
  ]);
  assert.doesNotMatch(r.out, /not reached/);
});

test('with CI=true a git-pinned runner that skips itself fails with its reason', () => {
  const { base, docs } = docsTree({ runners: { rust: 'skip' } });
  const upstream = join(base, 'upstream');
  const { first } = upstreamRepo(upstream);
  writeFileSync(join(docs, 'samples/pins/rust.json'), JSON.stringify(gitPin(first)));
  const r = run(['rust'], { docs, env: { CI: 'true', POLYJOSE_GIT_URL: `file://${upstream}` } });
  assert.equal(r.status, 1, r.out + r.err);
  assert.deepEqual(resultLines(r.out), [`FAIL (rust: toolchain not found; ${CI_RULE})`]);
  assert.match(r.out, /runner ran: rust/);
});

test('a runner that exits 77 without samples_skip is a FAIL, with and without CI', () => {
  const { docs } = docsTree({ pins: { js: REGISTRY }, runners: { js: 'exit77' } });
  for (const env of [{}, { CI: 'true' }]) {
    const r = run(['js'], { docs, env });
    assert.equal(r.status, 1, JSON.stringify(env) + r.out + r.err);
    assert.deepEqual(resultLines(r.out), ['FAIL (js: runner exited with status 77)']);
  }
});

test('with CI=true a sibling or clone problem is a FAIL, never SKIPPED', () => {
  // Each sibling state that the local path skips on, with a clone that cannot be fetched.
  const siblings = {
    'no sibling': () => {},
    'sibling at another commit': (sibling) => polyjoseRepo(sibling),
    'sibling with uncommitted changes': (sibling) => {
      polyjoseRepo(sibling);
      writeFileSync(join(sibling, 'README.md'), 'changed\n');
    },
    'sibling where git status fails': (sibling) => {
      polyjoseRepo(sibling);
      writeFileSync(join(sibling, '.git/index'), 'not an index');
    },
  };
  for (const [name, make] of Object.entries(siblings)) {
    const { base, docs } = docsTree({ pins: { rust: gitPin('c'.repeat(40)) }, runners: { rust: 'pass' } });
    make(join(base, 'polyjose'));
    const r = run(['rust'], { docs, env: { CI: 'true', POLYJOSE_GIT_URL: `file://${join(base, 'missing')}` } });
    assert.equal(r.status, 1, `${name}: ${r.out}${r.err}`);
    const lines = resultLines(r.out);
    assert.equal(lines.length, 1, name);
    assert.match(lines[0], /^FAIL \(rust: could not fetch polyjose cccccccccccc from file:\/\//, name);
    assert.doesNotMatch(r.out, /SKIPPED|PASS|runner ran/, name);
  }
});
