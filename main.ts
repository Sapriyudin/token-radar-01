// Launch Radar — token-radar-01 entry (Node 22, standard library only).
//
// Reads the sealed snapshot (758 DeFiLlama protocols, 14 Nov 2026), scores every pre-token
// protocol with the radar-2 model in lib/model.ts — a log-log regression with category
// intercepts, blind-tested at a typical miss of x5.72 — and writes the ranked board, the
// dashboard's data.js, the static dashboard, the three screenshots and the dossier the
// judge reads. The dashboard is a static page, no framework and no network: it reads
// /output/data.js and shows the board, a per-protocol detail view with the model's own
// inputs and the farm plan, the watchlist filter and the methodology.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/**
 * Re-read the board this run just wrote and confirm the gate's shape still holds: at least
 * 100 rows, ranks 1..N exactly once, implied value non-increasing with rank, and every
 * watchlist slug covered. A model change that silently broke the board fails loudly here
 * instead of reaching the judge.
 */
function verifyOutput(out: string, watchlist: string[]): string | null {
  const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')) as {
    rows: { rank: number; slug: string; implied_value_usd: number }[];
  };
  const rows = board.rows;
  if (rows.length < 100) return `board holds ${rows.length} rows, the gate needs at least 100`;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.rank !== i + 1) return `row ${i} carries rank ${rows[i]!.rank}, expected ${i + 1}`;
    if (i > 0 && rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      return `implied value rises from rank ${i} to rank ${i + 1}`;
    }
  }
  const seen = new Set(rows.map((r) => r.slug));
  const missing = watchlist.filter((slug) => !seen.has(slug));
  if (missing.length > 0) return `watchlist slugs missing from the board: ${missing.join(', ')}`;
  return null;
}

function main(): void {
  const inputArg = arg('input', '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
    process.exit(2);
  }
  const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
    process.exit(1);
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
  const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) {
    process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
    process.exit(1);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
      process.exit(1);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

  const bad = verifyOutput(out, snapshot.watchlist);
  if (bad !== null) {
    process.stderr.write(`token radar: the written board fails its own verification: ${bad}\n`);
    process.exit(1);
  }

  const m = radar.model;
  const v = radar.verdict_counts;
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: model ${radar.model_version} slope ${m.slope.toFixed(3)}, R2 ${m.r2.toFixed(3)}, blind typical miss x${m.blind_typical_miss.toFixed(2)}; verdicts farm ${v.farm} / thin ${v.thin} / skip ${v.skip}\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

main();
