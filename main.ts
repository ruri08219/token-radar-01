// token-radar-01: the entry point (Node 24, standard library only).
//
// It loads the sealed snapshot (from /input/snapshot.json, or --input <file|dir>), scores every
// pre-token protocol the house rule keeps using the model in lib/model.ts, and writes the ranked
// board to /output/board.json. It also copies this repository's dashboard/ and screenshots/ into
// /output, emits /output/data.js for the dashboard, and finishes with /output/dossier.json, the
// summary the judge reads, built with the vendored make.fun library.
//
// The dashboard is a static page with no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, which this program writes from the
// same board. The model prices each protocol off its own category's live-token multiples, ranks
// every rankable pre-token protocol at any size, and derives a farm plan from each row's record.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The directory this file lives in, so dashboard/ and screenshots/ can be found beside it. */
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const MAX_TEXT_BYTES = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The fewest screenshots the hand-in needs: the board, a detail view and a filtered view. */
const MIN_SHOTS = 3;

/** The value of `--name <value>` in the arguments, or `fallback` when it is absent. */
function flagValue(name: string, fallback: string): string {
  const position = process.argv.indexOf(`--${name}`);
  if (position >= 0 && position + 1 < process.argv.length) return process.argv[position + 1]!;
  const joined = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return joined === undefined ? fallback : joined.slice(name.length + 3);
}

/** Copy one directory's regular files into `target`, skipping names that start with a dot. */
function copyDirFiles(source: string, target: string): string[] {
  if (!existsSync(source)) return [];
  mkdirSync(target, { recursive: true });
  const copied: string[] = [];
  for (const entry of readdirSync(source)) {
    if (entry.startsWith('.')) continue;
    const sourcePath = join(source, entry);
    if (!statSync(sourcePath).isFile()) continue;
    copyFileSync(sourcePath, join(target, entry));
    copied.push(entry);
  }
  return copied;
}

const inputPath = flagValue('input', '/input');
const snapshotPath = inputPath.endsWith('.json') ? inputPath : join(inputPath, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(`token radar: no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const outputDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snap = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snap);
const problem = boardIssue(board, snap);
if (problem !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

copyDirFiles(join(repoRoot, 'dashboard'), join(outputDir, 'dashboard'));
const shots = copyDirFiles(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
if (shots.length < MIN_SHOTS) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in ${MIN_SHOTS}, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const shot of shots) {
  if (!IMAGE_NAME_RE.test(shot)) {
    process.stderr.write(`token radar: screenshots/${shot}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, { text_max_bytes: MAX_TEXT_BYTES, screenshots: SHOT_LIMITS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snap.protocols.length} protocols, ${snap.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ${join(outputDir, 'dashboard')} (3 files), ${join(outputDir, 'screenshots')} (${shots.length} images) and ${join(outputDir, 'dossier.json')}\n`,
);
