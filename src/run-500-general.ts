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
  "SELECT COUNT(*) as n FROM seed_records WHERE dataset IN ('bls','uci','kaggle')"
).get() as { n: number };

console.log('\n=== Pre-flight ===');
console.log(`  Seed pool (bls+uci+kaggle): ${poolRow.n} records`);
console.log(`  Personas to generate: 500 (ratio 1:${Math.floor(poolRow.n / 500)})`);
console.log(`  Models: ${MODELS.map(m => m.name).join(', ')}`);
console.log(`  Question set: consumer_preferences`);
console.log(`  Concurrency: 10 parallel persona interviews`);
console.log(`  Budget: $15.00`);

const config: ExperimentConfig = {
  name: '6. General Population (n=500)',
  dataset: 'bls',
  personaCount: 500,
  modelIds: ALL_MODEL_IDS,
  questionSetId: 'consumer_preferences',
  temperature: 1.0,
  budgetLimit: 15.0,
  concurrency: 10,
  filter: {
    datasets: ['bls', 'uci', 'kaggle'],
  },
};

console.log(`\n${'='.repeat(60)}`);
console.log('STARTING: 6. General Population (n=500)');
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
  console.log('RESULT: 6. General Population (n=500)');
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

  // Model comparison
  const modelBias = report.biases.find(b => b.type === 'model_bias');
  if (modelBias?.details && (modelBias.details as any).modelMeans) {
    console.log('\n--- Model Performance ---');
    for (const m of (modelBias.details as any).modelMeans) {
      console.log(`  ${m.model.split('/')[1]?.padEnd(30)} mean=${m.mean.toFixed(2)} (n=${m.n})`);
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
