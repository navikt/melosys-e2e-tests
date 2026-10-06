#!/usr/bin/env ts-node
/**
 * Slår sammen metrics-coverage.json fra shardene til én rapport for merge-jobben i e2e-tests.yml.
 * Filer som mangler hoppes over; finnes ingen, skrives ingenting.
 *
 * Bruk:
 *   npx ts-node scripts/merge-metrics.ts --out playwright-report shard-1/metrics-coverage.json ...
 */
import * as fs from 'fs';
import * as path from 'path';
import { mergeMetricsReports } from '../lib/metrics-merge';
import { generateMetricsJson, generateMetricsMarkdown } from '../lib/metrics-reporter';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
if (outIndex === -1 || !args[outIndex + 1]) {
  console.error('❌ --out <katalog> mangler');
  process.exit(2);
}
const outDir = args[outIndex + 1];
const files = args.filter((_, i) => i !== outIndex && i !== outIndex + 1).filter((f) => fs.existsSync(f));

if (files.length === 0) {
  console.log('📊 Ingen metrics-coverage.json fra shardene, hopper over metrikkene');
  process.exit(0);
}

const report = mergeMetricsReports(
  files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))),
  new Date().toISOString()
);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'metrics-coverage.json'), generateMetricsJson(report));
fs.writeFileSync(path.join(outDir, 'metrics-summary.md'), generateMetricsMarkdown(report));
console.log(`📊 Metrikker fra ${files.length} shard(s) slått sammen til ${outDir}/metrics-coverage.json`);
