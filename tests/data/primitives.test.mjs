// Tests for src/data/primitives.json, the data behind Security › Cryptographic
// foundations, and for the page built from it.
//
// The data credits every cryptographic primitive crate polyjose builds on and
// states its public audit status. The audit facts must match the published
// reports exactly: nothing stronger, nothing weaker. The page tests read the
// built HTML in dist/, so they run after `npm run build` (as `npm run verify`
// does) and are skipped, with a reason, when dist/ has not been built.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const primitives = JSON.parse(readFileSync(`${root}src/data/primitives.json`, 'utf8'));
const byCrate = new Map(primitives.map((p) => [p.crate, p]));

const RUSTCRYPTO = [
  'aes', 'aes-gcm', 'aes-kw', 'cbc', 'hmac', 'sha2', 'pbkdf2', 'p256', 'p384', 'p521',
  'k256', 'ecdsa', 'elliptic-curve', 'rsa', 'crypto-bigint', 'zeroize',
];
const DALEK = ['curve25519-dalek', 'ed25519-dalek', 'x25519-dalek', 'subtle'];
const RUST_RANDOM = ['getrandom'];
const ALL = [...RUSTCRYPTO, ...DALEK, ...RUST_RANDOM];

// The only crates with a published independent review of their own. The first
// four come from the audit register. crypto-bigint and subtle were in scope of
// two of those same reviews: the NCC Group report for Entropy lists the
// crypto-bigint repository in scope (and the crate's README says so), and the
// Quarkslab post names subtle among the libraries it audited.
const REVIEWED = ['aes-gcm', 'k256', 'curve25519-dalek', 'rsa', 'crypto-bigint', 'subtle'];

// Each crate's exact version in polyjose's Cargo.lock at commit f94b84a (0.2.0), copied
// by hand. A fixture on purpose: the data file is compared with the lockfile's
// values, not with itself.
const LOCKED = {
  aes: '0.9.4', 'aes-gcm': '0.11.1', 'aes-kw': '0.3.1', cbc: '0.2.1', hmac: '0.13.0', sha2: '0.11.1',
  pbkdf2: '0.13.0', p256: '0.14.0', p384: '0.14.0', p521: '0.14.0', k256: '0.14.0', ecdsa: '0.17.0',
  'elliptic-curve': '0.14.3', rsa: '0.10.0', 'crypto-bigint': '0.7.11', zeroize: '1.9.1',
  'curve25519-dalek': '5.0.0', 'ed25519-dalek': '3.0.0', 'x25519-dalek': '3.0.0', subtle: '2.6.1',
  getrandom: '0.4.3',
};

const STATUSES = ['audited', 'partial', 'none-found'];
const NONE_FOUND_NOTE = 'No public independent audit found';

const nonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

test('lists exactly the primitive crates, once each, in a stable order', () => {
  const crates = primitives.map((p) => p.crate);
  assert.equal(new Set(crates).size, crates.length, 'duplicate crate entry');
  assert.deepEqual([...crates].sort(), [...ALL].sort());
});

test('has no sha1 entry (polyjose uses no SHA-1)', () => {
  assert.equal(byCrate.has('sha1'), false);
  for (const p of primitives) {
    assert.doesNotMatch(p.purpose, /\bSHA-?1\b/i, `${p.crate}: purpose mentions SHA-1`);
  }
});

test('every entry has every field, and none is empty', () => {
  for (const p of primitives) {
    assert.deepEqual(
      Object.keys(p).sort(),
      ['audit', 'crate', 'license', 'purpose', 'repo', 'sources', 'upstream', 'version'],
      `${p.crate}: unexpected or missing fields`,
    );
    for (const key of ['crate', 'upstream', 'repo', 'license', 'purpose']) {
      assert.ok(nonEmptyString(p[key]), `${p.crate}: ${key} is empty`);
    }
    assert.ok(STATUSES.includes(p.audit.status), `${p.crate}: unknown audit status ${p.audit.status}`);
    assert.ok(nonEmptyString(p.audit.note), `${p.crate}: audit.note is empty`);
    for (const key of ['by', 'report']) {
      if (key in p.audit) assert.ok(nonEmptyString(p.audit[key]), `${p.crate}: audit.${key} is empty`);
    }
    if ('year' in p.audit) assert.ok(Number.isInteger(p.audit.year), `${p.crate}: audit.year is not a year`);
    assert.ok(Array.isArray(p.sources) && p.sources.length > 0, `${p.crate}: no sources`);
    for (const s of p.sources) assert.ok(nonEmptyString(s), `${p.crate}: empty source`);
  }
});

test('the purpose is one sentence', () => {
  for (const p of primitives) {
    assert.match(p.purpose, /^[A-Z].*\.$/s, `${p.crate}: purpose must be a full sentence`);
    assert.doesNotMatch(p.purpose.slice(0, -1), /[.!?]\s/, `${p.crate}: purpose has more than one sentence`);
  }
});

test('every link is https: repos, reports and sources', () => {
  for (const p of primitives) {
    const urls = [p.repo, ...p.sources, ...(p.audit.report ? [p.audit.report] : [])];
    for (const u of urls) {
      const url = new URL(u);
      assert.equal(url.protocol, 'https:', `${p.crate}: ${u} is not https`);
    }
  }
});

test('upstream project and license match each crate', () => {
  const expected = [
    ...RUSTCRYPTO.map((c) => [c, 'RustCrypto', 'MIT OR Apache-2.0']),
    ...DALEK.map((c) => [c, 'dalek-cryptography', 'BSD-3-Clause']),
    ...RUST_RANDOM.map((c) => [c, 'rust-random', 'MIT OR Apache-2.0']),
  ];
  for (const [crate, upstream, license] of expected) {
    const p = byCrate.get(crate);
    assert.equal(p.upstream, upstream, `${crate}: upstream`);
    assert.equal(p.license, license, `${crate}: license`);
    assert.ok(p.repo.startsWith(`https://github.com/${upstream}/`), `${crate}: repo is not under ${upstream}`);
    assert.ok(
      p.sources.includes(`https://crates.io/crates/${crate}`),
      `${crate}: the crates.io page (source of the license) is not listed in sources`,
    );
  }
});

test('only the crates with a published review of their own have a status other than none-found', () => {
  for (const p of primitives) {
    if (REVIEWED.includes(p.crate)) continue;
    assert.equal(p.audit.status, 'none-found', `${p.crate}: status must be none-found`);
  }
  for (const crate of REVIEWED) {
    assert.notEqual(byCrate.get(crate).audit.status, 'none-found', `${crate}: has a published review`);
  }
});

test('a reviewed crate names the reviewer, the year and a link to the report', () => {
  for (const p of primitives) {
    if (p.audit.status === 'none-found') {
      for (const key of ['by', 'year', 'report']) {
        assert.equal(key in p.audit, false, `${p.crate}: none-found must not carry audit.${key}`);
      }
      assert.ok(p.audit.note.startsWith(NONE_FOUND_NOTE), `${p.crate}: note must start "${NONE_FOUND_NOTE}"`);
      assert.match(p.audit.note, /widely deployed/, `${p.crate}: note must say the crate is widely deployed`);
    } else {
      for (const key of ['by', 'year', 'report']) {
        assert.ok(key in p.audit, `${p.crate}: a reviewed crate needs audit.${key}`);
      }
      assert.ok(p.sources.includes(p.audit.report), `${p.crate}: the report must also be listed in sources`);
    }
  }
});

test('aes-gcm: NCC Group, 2020, for MobileCoin, no significant findings, the 0.8 line', () => {
  const { audit } = byCrate.get('aes-gcm');
  assert.equal(audit.by, 'NCC Group');
  assert.equal(audit.year, 2020);
  assert.equal(
    audit.report,
    'https://www.nccgroup.com/research/public-report-rustcrypto-aesgcm-and-chacha20pluspoly1305-implementation-review/',
  );
  assert.match(audit.note, /\bMobileCoin\b/);
  assert.match(audit.note, /no significant findings/);
  assert.match(audit.note, /the 0\.8 line/);
  assert.match(audit.note, /later release line/);
  assert.equal(audit.status, 'partial', 'the review does not cover the line polyjose uses');
});

// The NCC Group report for Entropy names what it reviewed by commit, not by
// version: section 1, Executive Summary, Scope, on page 2 lists "Commits
// fde0661 and ad08a7e of github.com/RustCrypto/crypto-bigint" and "Commits
// 0f27814 and 5c829a4 of github.com/RustCrypto/elliptic-curves/k256".
// In the upstream repositories, 0f27814 is the commit titled "k256 v0.13.1"
// and 5c829a4 is the low-S fix made on that line, and fde0661 is the commit
// titled "v0.5.2" of crypto-bigint. So the review covered the k256 0.13 line
// and the crypto-bigint 0.5 line, both earlier than the lines polyjose uses
// (k256 0.14, crypto-bigint 0.7). The commit pages are listed in sources.
const ENTROPY_REPORT =
  'https://www.nccgroup.com/media/bq2gfxb3/_ncc_group_entropycryptography_e008526_report_2023-08-25_v10.pdf';
const REPORT_SCOPE = /\(report page 2, section 1, Executive Summary, Scope\)/;

test('k256: NCC Group, 2023, for Entropy, two high-severity findings, both fixed', () => {
  const { audit } = byCrate.get('k256');
  assert.equal(audit.by, 'NCC Group');
  assert.equal(audit.year, 2023);
  assert.equal(audit.report, ENTROPY_REPORT);
  assert.match(audit.note, /\bEntropy\b/);
  assert.match(audit.note, /two high-severity findings, both fixed/);
});

test('k256: the review covered commits of the 0.13 line, so the status is partial', () => {
  const { audit, sources } = byCrate.get('k256');
  assert.equal(audit.status, 'partial', 'the review does not cover the line polyjose uses');
  assert.match(audit.note, /\bcommits 0f27814 and 5c829a4\b/, 'the reviewed commits, as the report names them');
  assert.match(audit.note, REPORT_SCOPE, 'where the report says so');
  assert.match(audit.note, /\bthe 0\.13 line\b/);
  assert.match(audit.note, /later release line/);
  assert.ok(
    sources.includes('https://github.com/RustCrypto/elliptic-curves/commit/0f27814b47f4ea2a43f2958e91d142688c89d89a'),
    'the commit page that shows 0f27814 is the 0.13 line release commit',
  );
});

test('crypto-bigint: the review covered commits of the 0.5 line', () => {
  const { audit, sources } = byCrate.get('crypto-bigint');
  assert.match(audit.note, /\bcommits fde0661 and ad08a7e\b/, 'the reviewed commits, as the report names them');
  assert.match(audit.note, REPORT_SCOPE, 'where the report says so');
  assert.match(audit.note, /\bthe 0\.5 line\b/);
  assert.match(audit.note, /later release line/);
  assert.ok(
    sources.includes('https://github.com/RustCrypto/crypto-bigint/commit/fde06616bffa9659cd84754706597a42681d9575'),
    'the commit page that shows fde0661 is the 0.5 line release commit',
  );
});

test('curve25519-dalek: Quarkslab, 2019, for Tari, minor issues; x25519/ed25519 only marginally; later fixes', () => {
  const { audit, sources } = byCrate.get('curve25519-dalek');
  assert.equal(audit.by, 'Quarkslab');
  assert.equal(audit.year, 2019);
  assert.equal(audit.report, 'https://blog.quarkslab.com/security-audit-of-dalek-libraries.html');
  assert.match(audit.note, /\bTari\b/);
  assert.match(audit.note, /minor issues/);
  assert.match(audit.note, /x25519-dalek and ed25519-dalek were reviewed only marginally/);
  assert.match(audit.note, /RUSTSEC-2022-0093/);
  assert.match(audit.note, /Scalar/);
  assert.ok(sources.includes('https://rustsec.org/advisories/RUSTSEC-2022-0093.html'));
  assert.equal(audit.status, 'partial', 'the review predates later fixes and the line polyjose uses');
});

test('crypto-bigint: NCC Group, 2023, for Entropy, in the k256 review; diverged since', () => {
  const { audit } = byCrate.get('crypto-bigint');
  assert.equal(audit.by, 'NCC Group');
  assert.equal(audit.year, 2023);
  assert.equal(audit.report, byCrate.get('k256').audit.report, 'the same report as k256');
  assert.match(audit.note, /\bEntropy\b/);
  assert.match(audit.note, /no significant findings/);
  assert.match(audit.note, /diverged significantly since that review/);
  assert.equal(audit.status, 'partial');
});

test('subtle: Quarkslab, 2019, for Tari, in the dalek review', () => {
  const { audit } = byCrate.get('subtle');
  assert.equal(audit.by, 'Quarkslab');
  assert.equal(audit.year, 2019);
  assert.equal(audit.report, byCrate.get('curve25519-dalek').audit.report, 'the same post as curve25519-dalek');
  assert.match(audit.note, /\bTari\b/);
  assert.match(audit.note, /minor issues only/);
  assert.equal(audit.status, 'partial');
});

// The Quarkslab post limits its subtle finding to one toolchain and to
// software: "the audit verified that the source code and the assembly generated
// by Rust (version nightly-2019-06-11) do not have any trivial time leak. The
// audit does not validate that the library is immune to time leaks on a
// specific piece of hardware or outside the scope of the library." The entry
// carries both limits, as crypto-bigint carries its "diverged since" caveat.
test('subtle: carries the review\'s own limits, the 2019 nightly toolchain and no hardware guarantee', () => {
  const { note } = byCrate.get('subtle').audit;
  assert.match(note, /source code/);
  assert.match(note, /nightly-2019-06-11/, 'the toolchain the reviewed assembly came from');
  assert.match(note, /trivial tim(e|ing) leaks?/);
  assert.match(
    note,
    /"does not validate that the library is immune to time leaks on a specific piece of hardware or outside the scope of the library\."/,
    'the hardware limit, quoted from the post',
  );
  assert.match(note, /Later releases have followed since/);
});

test('x25519-dalek and ed25519-dalek: no audit of their own, the marginal review is mentioned, never as a full audit', () => {
  for (const crate of ['x25519-dalek', 'ed25519-dalek']) {
    const { audit, sources } = byCrate.get(crate);
    assert.equal(audit.status, 'none-found');
    assert.match(audit.note, /only marginally/, `${crate}: mention the marginal review`);
    assert.match(audit.note, /Quarkslab/);
    assert.ok(sources.includes('https://blog.quarkslab.com/security-audit-of-dalek-libraries.html'));
  }
  assert.match(byCrate.get('ed25519-dalek').audit.note, /RUSTSEC-2022-0093/);
});

test('rsa: Include Security, 2019, one minor finding, predates Marvin, the first patched release', () => {
  const { audit, sources, purpose } = byCrate.get('rsa');
  assert.equal(audit.by, 'Include Security');
  assert.equal(audit.year, 2019);
  assert.match(audit.note, /one minor finding/);
  assert.match(audit.note, /predates RUSTSEC-2023-0071/);
  assert.match(audit.note, /no published audit/);
  assert.match(audit.note, /first that the advisory lists as patched/);
  assert.match(purpose, /signing and verification/i);
  assert.match(purpose, /blinded/);
  assert.doesNotMatch(`${purpose} ${audit.note}`, /public-key operations only/i);
  assert.ok(sources.includes('https://rustsec.org/advisories/RUSTSEC-2023-0071.html'));
  assert.ok(sources.includes('https://github.com/RustCrypto/RSA'), 'the README the review is reported in');
  assert.equal(audit.status, 'partial', 'the current rewrite has no published audit');
});

test('each crate carries its exact Cargo.lock version, and no other field names a version', () => {
  assert.deepEqual(Object.keys(LOCKED).sort(), [...ALL].sort());
  for (const p of primitives) assert.equal(p.version, LOCKED[p.crate], `${p.crate}: version`);
  const text = JSON.stringify(primitives.map(({ version: _version, ...p }) => p));
  assert.doesNotMatch(text, /\bv?\d+\.\d+\.\d+/, 'an exact version belongs in the version field only');
});

test('the data never calls polyjose audited, carries no version requirements, and claims no constant-time behaviour', () => {
  const text = JSON.stringify(primitives);
  assert.doesNotMatch(text, /polyjose[^.]{0,60}\b(is|has been|was|are)\s+(independently\s+|professionally\s+)?audited\b/i);
  assert.doesNotMatch(text, /\bv\d+\b|=\d/, 'no version requirements');
  assert.doesNotMatch(text, /constant[- ]time/i, 'quote constant-time claims on the page, with a link');
});

// ---------------------------------------------------------------------------
// The built page.

const pagePath = `${root}dist/security/cryptographic-foundations/index.html`;
const built = existsSync(pagePath);
const skip = built ? false : 'dist/ is not built; run `npm run build` first';
const html = built ? readFileSync(pagePath, 'utf8') : '';
const main = built ? (html.match(/<main[\s\S]*<\/main>/) ?? [''])[0] : '';
const textOf = (s) =>
  s
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
const text = textOf(main);

test('page: the table is semantic, with a caption and column headers', { skip }, () => {
  const tables = main.match(/<table[\s\S]*?<\/table>/g) ?? [];
  const table = tables.find((t) => t.includes('data-primitives'));
  assert.ok(table, 'no primitives table');
  assert.match(table, /<caption[^>]*>[^<\s][\s\S]*?<\/caption>/, 'caption missing');
  const ths = table.match(/<th\b[^>]*>/g) ?? [];
  assert.ok(ths.length >= 5, 'too few column headers');
  const colHeaders = ths.filter((th) => /scope="col"/.test(th));
  assert.ok(colHeaders.length >= 5, 'column headers need scope="col"');
  for (const th of ths) assert.match(th, /scope="(col|row)"/, `header without scope: ${th}`);
  const rows = table.match(/<tbody[\s\S]*<\/tbody>/)[0].match(/<tr\b/g) ?? [];
  assert.equal(rows.length, primitives.length, 'one row per crate');
});

test('page: links every crate and every report', { skip }, () => {
  for (const p of primitives) {
    assert.ok(main.includes(`href="${p.repo}"`), `${p.crate}: no link to ${p.repo}`);
    if (p.audit.report) assert.ok(main.includes(`href="${p.audit.report}"`), `${p.crate}: no link to its report`);
  }
});

test('page: rsa signs and decrypts on the first patched release, with the advisory and the security pages linked', { skip }, () => {
  assert.ok(main.includes('href="https://rustsec.org/advisories/RUSTSEC-2023-0071.html"'));
  assert.ok(main.includes('href="/security/not-supported/"'));
  assert.ok(main.includes('href="/security/model/#rsa-private-key-operations"'));
  assert.match(text, /first release that RUSTSEC-2023-0071 \(the Marvin attack\) lists as patched/);
  assert.match(text, /with no exceptions/);
  assert.doesNotMatch(text, /public-key operations only|no patched release/);
});

/**
 * The body of the `<h2 id>` section: everything after the heading's wrapper up
 * to the next heading. The heading text (and its "Section titled" label) is
 * left out, so it cannot stand in for a sentence the body must say.
 */
function sectionBody(html, id) {
  const start = html.indexOf(`<h2 id="${id}"`);
  if (start === -1) return '';
  const bodyStart = html.indexOf('</div>', start) + '</div>'.length;
  const next = html.slice(bodyStart).search(/<div class="sl-heading-wrapper|<h[1-6]\b/);
  return next === -1 ? html.slice(bodyStart) : html.slice(bodyStart, bodyStart + next);
}

test('page: says there is no SHA-1, so no RSA-OAEP, and no RSA1_5, with the alternatives', { skip }, () => {
  const body = sectionBody(main, 'no-sha-1-and-no-rsa1_5');
  assert.ok(body, 'no "No SHA-1 and no RSA1_5" section');
  const bodyText = textOf(body);
  assert.match(bodyText, /\bpolyjose has no SHA-1 anywhere\./);
  assert.match(bodyText, /\bthere is no RSA-OAEP\b(?!-256)/, 'names RSA-OAEP (SHA-1) as absent');
  assert.match(bodyText, /\buse RSA-OAEP-256 or ECDH-ES\b/, 'gives the alternatives');
  assert.match(bodyText, /\bThere is also no RSA1_5 ?\./);
  assert.match(bodyText, /\bThe sha1 crate is not a dependency\b/, 'explains why the table has no sha1 row');
  for (const hash of ['sha-1', 'rsa1_5']) {
    assert.ok(body.includes(`href="/security/not-supported/#${hash}"`), `links /security/not-supported/#${hash}`);
  }
  const rsa = sectionBody(main, 'rsa-signing-and-decryption');
  assert.ok(
    rsa.includes('href="/security/not-supported/#rsa-key-generation-and-multi-prime-keys"'),
    'the RSA section links /security/not-supported/#rsa-key-generation-and-multi-prime-keys',
  );
});

test('page: shows the subtle review\'s limits next to its entry', { skip }, () => {
  const row = (main.match(/<tr data-crate="subtle"[\s\S]*?<\/tr>/) ?? [''])[0];
  assert.ok(row, 'no subtle row');
  const rowText = textOf(row);
  assert.match(rowText, /nightly-2019-06-11/);
  assert.match(rowText, /specific piece of hardware/);
  assert.ok(row.includes('href="https://blog.quarkslab.com/security-audit-of-dalek-libraries.html"'), 'links the post');
});

test('page: says polyjose itself has not had an independent audit yet, without pre-release wording', { skip }, () => {
  assert.match(text, /polyjose itself has not had an independent audit yet\./);
  assert.match(text, /It is built on the libraries above/);
  assert.doesNotMatch(text, /pre-1\.0|not (yet )?published|before 1\.0/i);
  assert.doesNotMatch(text, /polyjose[^.]{0,60}\b(is|has been|was|are)\s+(independently\s+|professionally\s+)?audited\b/i);
});

test('page: covers the trust rule, subtle and zeroize, the notices file and the build-time crates', { skip }, () => {
  for (const phrase of [
    'pure Rust',
    'no unresolved RustSec advisory',
    'Wycheproof',
    'THIRD-PARTY-NOTICES.txt',
    'curve25519-dalek-derive',
    'not linked into',
    'own security model',
  ]) {
    assert.ok(text.includes(phrase), `page does not mention "${phrase}"`);
  }
  for (const crate of ['syn', 'quote', 'proc-macro2']) assert.match(text, new RegExp(`\\b${crate}\\b`));
});

test('page: each row shows the crate\'s locked version, and says where the versions come from', { skip }, () => {
  for (const p of primitives) {
    const row = (main.match(new RegExp(`<tr data-crate="${p.crate}"[\\s\\S]*?</tr>`)) ?? [''])[0];
    assert.ok(row, `no ${p.crate} row`);
    assert.match(row, new RegExp(`<td class="version[^"]*"[^>]*>\\s*<code[^>]*>${p.version.replace(/\./g, '\\.')}</code>`), `${p.crate}: version cell`);
  }
  assert.match(text, /Cargo\.lock/);
  assert.match(text, /commit f94b84a/);
  assert.doesNotMatch(text, /before 0\.1\.0 is published/);
});

test('page: thanks the upstream maintainers by project name, and shows versions only in the table', { skip }, () => {
  assert.match(text, /[Tt]hank/);
  for (const project of ['RustCrypto', 'dalek-cryptography', 'rust-random']) {
    assert.ok(text.includes(project), `page does not name ${project}`);
  }
  // The page's framing sentence names the polyjose release it describes. Only
  // that exact sentence is exempt; any other x.y.z still fails.
  const framing = 'This page describes polyjose 0.2.0.';
  assert.ok(text.includes(framing), 'the framing sentence is on the page');
  const outsideTable = textOf(main.replace(/<table class="primitives[^"]*"[\s\S]*?<\/table>/, ' ')).split(framing).join(' ');
  const versions = [...outsideTable.matchAll(/\bv?\d+\.\d+\.\d+(?:-[\w.]+)?/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(versions)].filter((v) => v !== '0.2.0'), [], 'outside the table, only the release the page describes');
});
