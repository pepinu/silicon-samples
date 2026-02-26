import { getDb } from './data/db.js';
import { loadAllDatasets } from './data/seed-loader.js';
import { runExperiment } from './experiment/runner.js';
import { MODELS } from './config.js';
import type { ExperimentConfig } from './experiment/types.js';
import type { ValidationReport } from './validation/report.js';

// Ensure data is loaded
loadAllDatasets();

const ALL_MODEL_IDS = MODELS.map(m => m.id);

const experiments: ExperimentConfig[] = [
  {
    name: '1. Black Consumers',
    dataset: 'bls',
    personaCount: 100,
    modelIds: ALL_MODEL_IDS,
    questionSetId: 'consumer_preferences',
    temperature: 1.0,
    budgetLimit: 4.0,
    filter: {
      datasets: ['bls', 'uci'],
      race: 'black',
    },
  },
  {
    name: '2. Asian Consumers',
    dataset: 'bls',
    personaCount: 100,
    modelIds: ALL_MODEL_IDS,
    questionSetId: 'consumer_preferences',
    temperature: 1.0,
    budgetLimit: 4.0,
    filter: {
      datasets: ['bls', 'uci'],
      race: 'asian',
    },
  },
  {
    name: '3. Single Mothers',
    dataset: 'bls',
    personaCount: 100,
    modelIds: ALL_MODEL_IDS,
    questionSetId: 'consumer_preferences',
    temperature: 1.0,
    budgetLimit: 4.0,
    filter: {
      datasets: ['bls'],
      gender: 'female',
      marital_status: ['single', 'divorced'],
      kids_min: 1,
    },
  },
  {
    name: '4. Low-Income Households',
    dataset: 'bls',
    personaCount: 100,
    modelIds: ALL_MODEL_IDS,
    questionSetId: 'financial_attitudes',
    temperature: 1.0,
    budgetLimit: 4.0,
    filter: {
      datasets: ['bls'],
      income_max: 25000,
    },
  },
  {
    name: '5. Native American & Pacific Islander',
    dataset: 'bls',
    personaCount: 100,
    modelIds: ALL_MODEL_IDS,
    questionSetId: 'consumer_preferences',
    temperature: 1.0,
    budgetLimit: 4.0,
    filter: {
      datasets: ['bls', 'uci'],
      race: ['native_american', 'pacific_islander'],
    },
  },
];

// Check available pool sizes before running
const db = getDb();
console.log('\n=== Pre-flight: checking seed pool sizes ===\n');

const poolChecks = [
  { label: 'Black (BLS+UCI)', sql: "SELECT COUNT(*) as n FROM seed_records WHERE dataset IN ('bls','uci') AND race='black'" },
  { label: 'Asian (BLS+UCI)', sql: "SELECT COUNT(*) as n FROM seed_records WHERE dataset IN ('bls','uci') AND race='asian'" },
  { label: 'Single Mothers (BLS)', sql: "SELECT COUNT(*) as n FROM seed_records WHERE dataset='bls' AND gender='female' AND marital_status IN ('single','divorced') AND kids >= 1" },
  { label: 'Low Income <$25K (BLS)', sql: "SELECT COUNT(*) as n FROM seed_records WHERE dataset='bls' AND income < 25000" },
  { label: 'Native Am./Pac.Isl. (BLS+UCI)', sql: "SELECT COUNT(*) as n FROM seed_records WHERE dataset IN ('bls','uci') AND race IN ('native_american','pacific_islander')" },
];

for (const check of poolChecks) {
  const row = db.prepare(check.sql).get() as { n: number };
  console.log(`  ${check.label}: ${row.n} records`);
}

console.log('\n=== Starting 5 minority focus group experiments ===\n');
console.log(`Budget: $4.00 per experiment, $15.00 max total`);
console.log(`Models: ${ALL_MODEL_IDS.length} (${MODELS.map(m => m.name).join(', ')})`);
console.log('');

const results: Array<{ name: string; experimentId: number; report: ValidationReport; duration: number }> = [];
let totalCost = 0;

for (const config of experiments) {
  const start = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`STARTING: ${config.name}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const { experimentId, report } = await runExperiment(config, (progress) => {
      if (progress.status === 'interviewing' && progress.personasInterviewed % 10 === 0) {
        console.log(`  [${config.name}] ${progress.personasInterviewed}/${progress.totalPersonas} interviewed, cost: $${progress.costSoFar.toFixed(4)}`);
      }
    });

    const duration = (Date.now() - start) / 1000;
    results.push({ name: config.name, experimentId, report, duration });
    totalCost += report.filtering.total > 0 ? parseFloat(
      (db.prepare('SELECT COALESCE(SUM(cost),0) as c FROM cost_log WHERE experiment_id = ?').get(experimentId) as { c: number }).c.toFixed(4)
    ) : 0;

    console.log(`\n  RESULT: ${config.name}`);
    console.log(`  Score: ${report.overallScore}/100 (${report.overallVerdict.toUpperCase()})`);
    console.log(`  Valid: ${report.filtering.valid}/${report.filtering.total} (${(report.filtering.validRate * 100).toFixed(1)}%)`);
    console.log(`  Human equivalent: ~${report.effectiveHumanEquivalent} participants`);
    console.log(`  Duration: ${duration.toFixed(1)}s`);

    if (report.filtering.reasons && Object.keys(report.filtering.reasons).length > 0) {
      console.log(`  Filtered: ${JSON.stringify(report.filtering.reasons)}`);
    }

    for (const d of report.distributional) {
      console.log(`  ${d.dimension}: chi2 p=${d.chiSquared.pValue.toFixed(4)}, KL=${d.kl.divergence.toFixed(4)} (${d.kl.quality}) ${d.passed ? 'PASS' : 'FAIL'}`);
    }

    for (const b of report.biases) {
      if (b.severity !== 'none') {
        console.log(`  BIAS [${b.severity.toUpperCase()}]: ${b.type} - ${b.description}`);
      }
    }
  } catch (err) {
    console.error(`  FAILED: ${(err as Error).message}`);
  }
}

// Final summary
console.log(`\n\n${'='.repeat(60)}`);
console.log('SUMMARY: 5 Minority Focus Group Experiments');
console.log(`${'='.repeat(60)}\n`);

console.log('| # | Group                    | Score | Verdict  | Valid Rate | Human Eq. | Duration |');
console.log('|---|--------------------------|-------|----------|------------|-----------|----------|');
for (const r of results) {
  const pct = (r.report.filtering.validRate * 100).toFixed(0);
  console.log(`| ${r.name.padEnd(25)}| ${String(r.report.overallScore).padStart(5)} | ${r.report.overallVerdict.padEnd(8)} | ${(pct + '%').padStart(10)} | ${String('~' + r.report.effectiveHumanEquivalent).padStart(9)} | ${(r.duration.toFixed(0) + 's').padStart(8)} |`);
}

const costRow = db.prepare('SELECT COALESCE(SUM(cost),0) as c FROM cost_log').get() as { c: number };
console.log(`\nTotal cost: $${costRow.c.toFixed(4)}`);
console.log(`Total duration: ${results.reduce((s, r) => s + r.duration, 0).toFixed(0)}s`);

// Bias comparison across groups
console.log('\n--- Bias Comparison Across Groups ---\n');
const biasTypes = ['social_desirability', 'mode_collapse', 'caricaturing', 'model_bias'];
console.log('| Bias Type            | ' + results.map(r => r.name.split('.')[1]?.trim().substring(0, 12).padEnd(12)).join(' | ') + ' |');
console.log('|----------------------|' + results.map(() => '--------------|').join(''));
for (const bt of biasTypes) {
  const cells = results.map(r => {
    const b = r.report.biases.find(b => b.type === bt);
    return (b?.severity || 'n/a').padEnd(12);
  });
  console.log(`| ${bt.replace(/_/g, ' ').padEnd(20)} | ${cells.join(' | ')} |`);
}

// Model comparison across groups
console.log('\n--- Model Performance Across Groups ---\n');
for (const r of results) {
  const modelBias = r.report.biases.find(b => b.type === 'model_bias');
  if (modelBias && modelBias.details && (modelBias.details as any).modelMeans) {
    console.log(`${r.name}:`);
    for (const m of (modelBias.details as any).modelMeans) {
      console.log(`  ${m.model.split('/')[1]?.padEnd(30)} mean=${m.mean.toFixed(2)} (n=${m.n})`);
    }
  }
}

process.exit(0);
