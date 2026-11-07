#!/usr/bin/env node
// Converts a line of text to one SVG path, using a font's glyph outlines.
//
// This is how every lettering path in brand/src/ was made: the "polyjose"
// wordmark, the tagline and the platform names in og.svg and
// social-preview.svg. The SVGs carry the resulting path data, so no font is
// needed to show them and no font file is kept in this repository (see
// brand/CREDITS.md). No npm script runs this tool. Run it by hand only when
// the lettering changes.
//
// Font: Inter Display SemiBold from Inter 4.1 (SIL Open Font License 1.1).
//   1. Download https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
//      into a new, empty folder outside this repository.
//   2. Check it before use: its sha256 must be
//      9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e
//      (`shasum -a 256 Inter-4.1.zip`).
//   3. Extract extras/ttf/InterDisplay-SemiBold.ttf from it.
//   Never commit the font file.
//
// Usage, from the repository root (fontkitten is installed by `npm ci`):
//   node brand/tools/outline.mjs <InterDisplay-SemiBold.ttf> "<text>" [size] [tracking]
//
//   size      font size in SVG user units (default 100). The baseline is y = 0,
//             so ascenders have negative y and descenders positive y.
//   tracking  extra space between letters, in em (default 0).
//
// Output: one line of JSON with the font name and version, the advance width
// of the text, the font metrics at that size and `d`, the path data. Glyphs are
// placed by their advance widths only: fontkitten does not apply kerning, so
// the spacing is Inter's default letter spacing.
//
// The calls behind brand/src/ (all with tracking 0):
//   "polyjose"                                   size 100  (wordmark, every lockup)
//   "One JOSE implementation, every platform."   size 100  (tagline, scaled in place)
//   "Rust", "Node.js", "Web (WASM)", "Android (Kotlin)", "Swift (iOS)"
//                                                size 100  (platform names, scaled in place)
// Each path is placed with a translate() and scale() transform in the SVG.

import { readFileSync } from 'node:fs';
import { create } from 'fontkitten';

/** The version string of the Inter 4.1 release fonts. */
export const EXPECTED_VERSION = /^Version 4\.001;/;

const COMMANDS = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' };

const round = (v) => +v.toFixed(2);

/**
 * Outlines `text` in `font` at `size` user units with `trackEm` extra
 * letter spacing. Returns the advance width and the path data, with the
 * baseline at y = 0 and y pointing down (SVG coordinates).
 */
export function outline(font, text, size = 100, trackEm = 0) {
	const scale = size / font.unitsPerEm;
	const track = trackEm * font.unitsPerEm;
	const glyphs = font.glyphsForString(text);
	let x = 0;
	const parts = [];
	glyphs.forEach((g, i) => {
		for (const c of g.path.commands) {
			const a = c.args.slice();
			for (let j = 0; j < a.length; j += 2) {
				a[j] = round((a[j] + x) * scale);
				a[j + 1] = round(-a[j + 1] * scale);
			}
			parts.push(COMMANDS[c.command] + a.join(' '));
		}
		x += g.advanceWidth + (i < glyphs.length - 1 ? track : 0);
	});
	return { width: round(x * scale), d: parts.join('') };
}

function main(argv) {
	const [fontPath, text, size = '100', trackEm = '0'] = argv;
	if (!fontPath || text === undefined) {
		console.error('usage: node brand/tools/outline.mjs <InterDisplay-SemiBold.ttf> "<text>" [size] [tracking]');
		return 2;
	}
	const font = create(readFileSync(fontPath));
	if (font.familyName !== 'Inter Display SemiBold' || !EXPECTED_VERSION.test(font.version)) {
		console.error(`expected Inter Display SemiBold from Inter 4.1, got "${font.familyName}" "${font.version}"`);
		return 1;
	}
	const scale = Number(size) / font.unitsPerEm;
	const { width, d } = outline(font, text, Number(size), Number(trackEm));
	console.log(
		JSON.stringify({
			family: font.familyName,
			version: font.version,
			size: Number(size),
			width,
			xHeight: round((font['OS/2']?.xHeight ?? 0) * scale),
			capHeight: round((font['OS/2']?.capHeight ?? 0) * scale),
			ascent: round(font.ascent * scale),
			descent: round(font.descent * scale),
			d,
		}),
	);
	return 0;
}

if (import.meta.filename === process.argv[1]) process.exitCode = main(process.argv.slice(2));
