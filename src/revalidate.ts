#!/usr/bin/env npx tsx
/**
 * Re-validate existing experiments with fixed validation code.
 * Clears old validation rows and re-runs generateReport().
 */
import { getDb } from './data/db.js';
import { generateReport } from './validation/report.js';

const experimentIds = process.argv.slice(2).map(Number).filter(Boolean);
if (experimentIds.length === 0) {
  console.error('Usage: npx tsx src/revalidate.ts <experimentId> [experimentId...]');
  process.exit(1);
}

const db = getDb();

for (const id of experimentIds) {
  const exp = db.prepare('SELECT id, name FROM experiments WHERE id = ?').get(id) as { id: number; name: string } | undefined;
  if (!exp) {
    console.error(`Experiment #${id} not found, skipping.`);
    continue;
  }

  console.log(`\n=== Re-validating Experiment #${id}: ${exp.name} ===`);

  // Clear old validation rows
  const deleted = db.prepare('DELETE FROM validations WHERE experiment_id = ?').run(id);
  console.log(`  Cleared ${deleted.changes} old validation rows`);

  // Re-run validation
  try {
    const report = generateReport(id);
    console.log(`  Score: ${report.overallScore}/100 (${report.overallVerdict})`);
    console.log(`  Valid: ${report.filtering.valid}/${report.filtering.total} (${(report.filtering.validRate * 100).toFixed(1)}%)`);
    console.log(`  Distributional:`);
    for (const d of report.distributional) {
      console.log(`    ${d.dimension}: chi2=${d.chiSquared.statistic.toFixed(2)} p=${d.chiSquared.pValue.toFixed(4)} KL=${d.kl.divergence.toFixed(4)} → ${d.passed ? 'PASS' : 'FAIL'}`);
    }
    console.log(`  Biases: ${report.biases.map(b => `${b.type}(${b.severity})`).join(', ') || 'none'}`);
    if (report.calibration) {
      console.log(`  Calibration: raw=${report.calibration.rawMean.toFixed(2)} → calibrated=${report.calibration.calibratedMean.toFixed(2)} (gap: ${report.calibration.directionGap.raw.toFixed(2)})`);
    }
    console.log(`  Effective human equivalent: ~${report.effectiveHumanEquivalent}`);
  } catch (err: any) {
    console.error(`  Error: ${err.message}`);
  }
}

console.log('\nDone. Rebuild static site to see updated results.');
