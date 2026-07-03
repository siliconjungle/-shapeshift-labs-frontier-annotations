import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  createFrontierAnnotationCodexTask,
  createFrontierAnnotationContext,
  rankFrontierAnnotationSources
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '..', '..');
const args = parseArgs(process.argv.slice(2));
const rounds = readPositiveInt(args.rounds, 11);
const sourceCount = readPositiveInt(args.sources, 1000);
const outPath = args.out ? path.resolve(repoRoot, args.out) : null;

const annotation = {
  kind: 'frontier.annotations.annotation',
  version: 1,
  id: 'bench-annotation',
  note: 'Make the save button clearer and less ambiguous.',
  target: {
    tagName: 'button',
    selector: '[data-testid="save-button"]',
    cssPath: 'main > button.primary',
    attributes: { 'data-testid': 'save-button' },
    dataset: { testid: 'save-button' },
    rect: { x: 0, y: 0, width: 120, height: 32, top: 0, right: 120, bottom: 32, left: 0 },
    ancestry: [{ tagName: 'button', selector: '[data-testid="save-button"]', testId: 'save-button' }],
    text: 'Save draft'
  },
  css: [{ selector: '.primary', cssText: '.primary { color: red; }' }],
  sourceHints: [{ file: 'src/components/SaveButton.tsx', symbol: 'SaveButton' }],
  route: '/editor',
  createdAt: Date.now(),
  status: 'draft'
};
const sources = makeSources(sourceCount);
const rankingSamples = [];
const contextSamples = [];
const taskSamples = [];

for (let round = 0; round < rounds; round++) {
  let start = performance.now();
  const ranking = rankFrontierAnnotationSources(annotation, sources);
  rankingSamples.push((performance.now() - start) * 1000);
  start = performance.now();
  const context = createFrontierAnnotationContext(annotation, sources, { maxFiles: 8, maxPromptBytes: 32_000 });
  contextSamples.push((performance.now() - start) * 1000);
  start = performance.now();
  createFrontierAnnotationCodexTask(annotation, context, { targetRefs: ['src/components/SaveButton.tsx'] });
  taskSamples.push((performance.now() - start) * 1000);
  if (ranking[0].file !== 'src/components/SaveButton.tsx') throw new Error('ranking fixture failed');
}

const rowsOut = [
  summarize('Rank annotation against source graph', rankingSamples, sourceCount),
  summarize('Create bounded context', contextSamples, 8),
  summarize('Create Codex task prompt', taskSamples, 1)
];
const report = {
  package: '@shapeshift-labs/frontier-annotations',
  version: readPackageVersion(),
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform + ' ' + process.arch,
  sourceCount,
  rounds,
  rowsOut
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}

console.log(report.package + ' package benchmark');
console.log('Node ' + report.node + ' on ' + report.platform + ', sources=' + sourceCount + ', rounds=' + rounds);
console.log('These are Frontier-only package measurements, not competitor comparisons.');
console.log('');
console.log(padRight('Fixture', 40) + padLeft('Median', 12) + padLeft('p95', 12) + padLeft('Items', 10));
for (const row of rowsOut) {
  console.log(padRight(row.fixture, 40) + padLeft(formatUs(row.medianUs), 12) + padLeft(formatUs(row.p95Us), 12) + padLeft(String(row.items), 10));
}
if (outPath) console.log('\nwrote ' + path.relative(repoRoot, outPath));

function makeSources(count) {
  const out = [];
  out.push({
    file: 'src/components/SaveButton.tsx',
    text: 'export function SaveButton() { return <button data-testid="save-button">Save draft</button>; }',
    layer: 'frontend-component',
    declarations: [{ name: 'SaveButton' }],
    imports: [{ specifier: '../actions/save' }]
  });
  for (let index = 1; index < count; index++) {
    out.push({
      file: 'src/components/Component' + index + '.tsx',
      text: 'export function Component' + index + '() { return <div>Item ' + index + '</div>; }',
      layer: 'frontend-component',
      declarations: [{ name: 'Component' + index }]
    });
  }
  return out;
}

function summarize(fixture, samples, items) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    fixture,
    medianUs: percentile(sorted, 0.5),
    p95Us: percentile(sorted, 0.95),
    items
  };
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))] ?? 0;
}

function formatUs(value) {
  return value >= 1000 ? (value / 1000).toFixed(2) + 'ms' : value.toFixed(1) + 'us';
}

function padRight(value, length) {
  return String(value).padEnd(length);
}

function padLeft(value, length) {
  return String(value).padStart(length);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--out') parsed.out = argv[++index];
    else if (arg.startsWith('--out=')) parsed.out = arg.slice('--out='.length);
    else if (arg === '--rounds') parsed.rounds = argv[++index];
    else if (arg.startsWith('--rounds=')) parsed.rounds = arg.slice('--rounds='.length);
    else if (arg === '--sources') parsed.sources = argv[++index];
    else if (arg.startsWith('--sources=')) parsed.sources = arg.slice('--sources='.length);
    else throw new Error('unknown argument: ' + arg);
  }
  return parsed;
}

function readPositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
}
