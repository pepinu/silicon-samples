import { getDb } from './data/db.js';
import { loadAllDatasets } from './data/seed-loader.js';
import { runExperiment } from './experiment/runner.js';
import { MODELS } from './config.js';
import type { ExperimentConfig } from './experiment/types.js';

// Ensure data is loaded
loadAllDatasets();

const db = getDb();
const ALL_MODEL_IDS = MODELS.map(m => m.id);

// Pre-flight: check seed pool
const poolRow = db.prepare(
  "SELECT COUNT(*) as n FROM seed_records WHERE dataset IN ('bls','uci') AND race = 'black'"
).get() as { n: number };

console.log('\n=== Pre-flight ===');
console.log(`  Seed pool (Black Americans, bls+uci): ${poolRow.n} records`);
console.log(`  Personas to generate: 300 (ratio 1:${Math.floor(poolRow.n / 300)})`);
console.log(`  Models (${MODELS.length}): ${MODELS.map(m => m.name).join(', ')}`);
console.log(`  Question set: consumer_preferences (12 questions, 4 reverse-coded)`);
console.log(`  Concurrency: 10 parallel persona interviews`);
console.log(`  Budget: $8.00`);
console.log(`  Backstory mode: THIRD-PERSON (Chapala et al. 2025)`);
console.log(`  Compare against: Exp #11 (Black n=500, first-person, score=70)`);

const config: ExperimentConfig = {
  name: '12. Black American Consumers v2 — Third-Person (n=300)',
  dataset: 'bls',
  personaCount: 300,
  modelIds: ALL_MODEL_IDS,
  questionSetId: 'consumer_preferences',
  temperature: 1.0,
  budgetLimit: 8.0,
  concurrency: 10,
  backstoryMode: 'third-person',
  filter: {
    datasets: ['bls', 'uci'],
    race: 'black',
  },
};

console.log(`\n${'='.repeat(60)}`);
console.log(`STARTING: ${config.name}`);
console.log(`${'='.repeat(60)}\n`);

const start = Date.now();

try {
  const { experimentId, report } = await runExperiment(config, (progress) => {
    if (progress.status === 'sampling' && progress.personasGenerated % 50 === 0 && progress.personasGenerated > 0) {
      console.log(`  [sampling] ${progress.personasGenerated}/${progress.totalPersonas} personas built`);
    }
    if (progress.status === 'interviewing' && progress.personasInterviewed % 10 === 0 && progress.personasInterviewed > 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const rate = (progress.personasInterviewed / ((Date.now() - start) / 1000)).toFixed(1);
      console.log(`  [interviewing] ${progress.personasInterviewed}/${progress.totalPersonas} interviewed | $${progress.costSoFar.toFixed(4)} | ${elapsed}s elapsed | ${rate} personas/s`);
    }
  });

  const duration = (Date.now() - start) / 1000;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT: ${config.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Score: ${report.overallScore}/100 (${report.overallVerdict.toUpperCase()})`);
  console.log(`  Valid: ${report.filtering.valid}/${report.filtering.total} (${(report.filtering.validRate * 100).toFixed(1)}%)`);
  console.log(`  Human equivalent: ~${report.effectiveHumanEquivalent} participants`);
  console.log(`  Duration: ${(duration / 60).toFixed(1)} minutes (${duration.toFixed(0)}s)`);

  if (report.filtering.reasons && Object.keys(report.filtering.reasons).length > 0) {
    console.log(`  Filtered: ${JSON.stringify(report.filtering.reasons)}`);
  }

  console.log('\n--- Distributional Validation ---');
  for (const d of report.distributional) {
    console.log(`  ${d.dimension}: chi2 p=${d.chiSquared.pValue.toFixed(4)}, KL=${d.kl.divergence.toFixed(4)} (${d.kl.quality}) ${d.passed ? 'PASS' : 'FAIL'}`);
  }

  console.log('\n--- Bias Detection ---');
  for (const b of report.biases) {
    console.log(`  ${b.type}: ${b.severity}${b.severity !== 'none' ? ` — ${b.description}` : ''}`);
  }

  const sdBias = report.biases.find(b => b.type === 'social_desirability');
  if (sdBias?.details) {
    const d = sdBias.details as any;
    if (d.positiveCodedStats) console.log(`    Positive-coded: mean=${d.positiveCodedStats.mean.toFixed(2)}, z=${d.positiveCodedStats.zScore.toFixed(2)} (n=${d.positiveCodedStats.n})`);
    if (d.negativeCodedStats) console.log(`    Negative-coded: mean=${d.negativeCodedStats.mean.toFixed(2)}, z=${d.negativeCodedStats.zScore.toFixed(2)} (n=${d.negativeCodedStats.n})`);
    if (d.directionGap != null) console.log(`    Direction gap: ${d.directionGap.toFixed(2)} (positive - negative coded means)`);
  }

  console.log('\n--- Post-hoc Calibration ---');
  const cal = report.calibration;
  console.log(`  Method: ${cal.method} (confidence: ${cal.confidence})`);
  console.log(`  Raw overall mean: ${cal.rawMean.toFixed(2)} → Calibrated: ${cal.calibratedMean.toFixed(2)} (correction: ±${cal.correctionApplied.toFixed(2)})`);
  console.log(`  Direction gap: ${cal.directionGap.raw.toFixed(2)} → ${cal.directionGap.calibrated.toFixed(2)} (expected human: ${cal.directionGap.expectedHuman})`);

  // Comparison
  console.log('\n--- Comparison vs Exp #11 (first-person) ---');
  console.log(`  Exp #11: score=70, SD gap=3.42, calibrated mean=4.03`);
  console.log(`  This exp: score=${report.overallScore}, SD gap=${cal.directionGap.raw.toFixed(2)}, calibrated mean=${cal.calibratedMean.toFixed(2)}`);
  const gapDelta = 3.42 - cal.directionGap.raw;
  console.log(`  SD gap change: ${gapDelta > 0 ? '-' : '+'}${Math.abs(gapDelta).toFixed(2)} (${gapDelta > 0 ? 'IMPROVED' : 'WORSE'})`);

  const modelBias = report.biases.find(b => b.type === 'model_bias');
  if (modelBias?.details && (modelBias.details as any).modelMeans) {
    console.log('\n--- Model Likert Means ---');
    for (const m of (modelBias.details as any).modelMeans) {
      console.log(`  ${m.model.split('/')[1]?.padEnd(35)} mean=${m.mean.toFixed(2)} (n=${m.n})`);
    }
  }

  const costRow = db.prepare('SELECT COALESCE(SUM(cost),0) as c FROM cost_log WHERE experiment_id = ?').get(experimentId) as { c: number };
  console.log(`\n  Total cost: $${costRow.c.toFixed(4)}`);
} catch (err) {
  console.error(`\nFAILED: ${(err as Error).message}`);
  console.error((err as Error).stack);
  process.exit(1);
}

process.exit(0);
