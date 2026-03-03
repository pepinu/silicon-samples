/**
 * Static site builder for Vercel deployment.
 * Reads the SQLite database and exports all API responses as JSON files.
 * Copies web assets (HTML, JS, CSS) into dist/.
 * Result: a fully static site that works without a server.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import Database from 'better-sqlite3';

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(PROJECT_ROOT, 'dist');
const WEB_SRC = path.resolve(PROJECT_ROOT, 'src', 'web');
const DB_PATH = path.resolve(PROJECT_ROOT, process.env.DB_PATH || 'data/silicon-samples.db');

// Model config (duplicated from config.ts to avoid side effects)
const MODELS = [
  // Western models
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', inputCostPer1M: 0.50, outputCostPer1M: 3.00, weight: 2 },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku', inputCostPer1M: 1.00, outputCostPer1M: 5.00, weight: 1 },
  { id: 'mistralai/mistral-small-3.2-24b-instruct', name: 'Mistral Small', inputCostPer1M: 0.10, outputCostPer1M: 0.30, weight: 1 },
  { id: 'x-ai/grok-3-mini-beta', name: 'Grok 3 Mini', inputCostPer1M: 0.30, outputCostPer1M: 0.50, weight: 1 },
  // Chinese models
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', inputCostPer1M: 0.25, outputCostPer1M: 0.40, weight: 2 },
  { id: 'bytedance-seed/seed-2.0-mini', name: 'Seed 2.0 Mini', inputCostPer1M: 0.10, outputCostPer1M: 0.40, weight: 2 },
  { id: 'minimax/minimax-m2.5-20260211', name: 'MiniMax M2.5', inputCostPer1M: 0.30, outputCostPer1M: 0.30, weight: 2 },
  { id: 'xiaomi/mimo-v2-flash-20251210', name: 'Xiaomi MiMo V2', inputCostPer1M: 0.10, outputCostPer1M: 0.10, weight: 2 },
];

const DEFAULTS = {
  temperature: 1.0,
  maxConcurrency: 5,
  budgetLimit: 5.00,
  personaCount: 50,
  questionsPerPersona: 8,
};

function modelName(id: string): string {
  return MODELS.find(m => m.id === id)?.name || id.split('/')[1] || id;
}

function writeJson(relPath: string, data: unknown) {
  const fullPath = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data));
  console.log(`  ${relPath} (${(JSON.stringify(data).length / 1024).toFixed(1)}KB)`);
}

// ---- Dataset distributions (replicating distributions.ts logic) ----
function getNumericDistribution(db: Database.Database, dataset: string, dimension: string) {
  const binConfigs: Record<string, { boundaries: number[]; labels: string[] }> = {
    age: { boundaries: [0, 25, 35, 45, 55, 65, 100], labels: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] },
    income: { boundaries: [0, 25000, 50000, 75000, 100000, 150000, Infinity], labels: ['<$25K', '$25-50K', '$50-75K', '$75-100K', '$100-150K', '$150K+'] },
  };
  const config = binConfigs[dimension];
  const stats = db.prepare(`SELECT COUNT(*) as total FROM seed_records WHERE dataset = ? AND ${dimension} IS NOT NULL`).get(dataset) as any;
  if (!stats || stats.total === 0) return { dimension, bins: [], total: 0 };

  const bins = config.labels.map((label, i) => {
    const bMax = config.boundaries[i + 1] === Infinity ? 999999999 : config.boundaries[i + 1];
    const row = db.prepare(`SELECT COUNT(*) as count FROM seed_records WHERE dataset = ? AND ${dimension} >= ? AND ${dimension} < ?`).get(dataset, config.boundaries[i], bMax) as any;
    return { label, count: row.count, proportion: row.count / stats.total };
  });
  return { dimension, bins, total: stats.total };
}

function getCategoricalDistribution(db: Database.Database, dataset: string, dimension: string) {
  const rows = db.prepare(`SELECT ${dimension} as label, COUNT(*) as count FROM seed_records WHERE dataset = ? AND ${dimension} IS NOT NULL GROUP BY ${dimension} ORDER BY count DESC`).all(dataset) as any[];
  const total = rows.reduce((s: number, r: any) => s + r.count, 0);
  return { dimension, bins: rows.map((r: any) => ({ label: r.label, count: r.count, proportion: total > 0 ? r.count / total : 0 })), total };
}

function getDistribution(db: Database.Database, dataset: string, dimension: string) {
  if (['age', 'income'].includes(dimension)) return getNumericDistribution(db, dataset, dimension);
  return getCategoricalDistribution(db, dataset, dimension);
}

function getAllDistributions(db: Database.Database, dataset: string) {
  return ['age', 'income', 'education', 'marital_status'].map(d => getDistribution(db, dataset, d));
}

// ---- Cost calculation (replicating cost-tracker.ts) ----
function getExperimentCost(db: Database.Database, experimentId: number) {
  const total = db.prepare(`SELECT COALESCE(SUM(cost), 0) as totalCost, COALESCE(SUM(input_tokens), 0) as totalInputTokens, COALESCE(SUM(output_tokens), 0) as totalOutputTokens FROM cost_log WHERE experiment_id = ?`).get(experimentId) as any;
  const byModel = db.prepare(`SELECT model_id as modelId, SUM(cost) as cost, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens, COUNT(*) as callCount FROM cost_log WHERE experiment_id = ? GROUP BY model_id`).all(experimentId) as any[];
  return { ...total, byModel: byModel.map((m: any) => ({ ...m, modelName: modelName(m.modelId) })) };
}

// ---- Main build ----
async function build() {
  console.log('Building static site...');
  console.log(`DB: ${DB_PATH}`);
  console.log(`Output: ${DIST}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  // Clean dist
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
  fs.mkdirSync(DIST, { recursive: true });

  // 1. Copy web assets
  console.log('\nCopying web assets...');
  const webFiles = fs.readdirSync(WEB_SRC);
  for (const file of webFiles) {
    fs.copyFileSync(path.join(WEB_SRC, file), path.join(DIST, file));
    console.log(`  ${file}`);
  }

  // 2. Open database
  const db = new Database(DB_PATH, { readonly: true });

  // 3. Generate experiments.json
  console.log('\nGenerating API data...');
  const experiments = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM personas WHERE experiment_id = e.id) as persona_count_actual,
      (SELECT COUNT(*) FROM responses r JOIN personas p ON r.persona_id = p.id WHERE p.experiment_id = e.id) as response_count,
      (SELECT COALESCE(SUM(cost), 0) FROM cost_log WHERE experiment_id = e.id) as total_cost
    FROM experiments e ORDER BY e.created_at DESC
  `).all() as any[];
  writeJson('data/experiments.json', experiments);

  // 4. Generate datasets.json
  const datasets = db.prepare(`
    SELECT dataset, COUNT(*) as count,
      AVG(age) as avg_age, AVG(income) as avg_income
    FROM seed_records GROUP BY dataset ORDER BY count DESC
  `).all() as any[];
  writeJson('data/datasets.json', datasets);

  // 5. Generate experiments meta endpoints
  writeJson('data/experiments/models.json', MODELS);

  // Question sets - read from the question bank module
  // We'll query the DB to reconstruct what question sets were used
  const questionSets = [{
    id: 'consumer_preferences',
    name: 'Consumer Preferences',
    questions: db.prepare(`
      SELECT DISTINCT question_id, question_text, question_type
      FROM responses WHERE question_id NOT LIKE '%_followup'
      ORDER BY id LIMIT 20
    `).all(),
  }];
  writeJson('data/experiments/question-sets.json', questionSets);

  writeJson('data/experiments/defaults.json', {
    ...DEFAULTS,
    apiKeyConfigured: false, // static mode, no API key needed
  });

  // 6. Per-dataset data
  for (const ds of datasets) {
    const distributions = getAllDistributions(db, ds.dataset);
    writeJson(`data/datasets/${ds.dataset}/distributions.json`, distributions);

    const samples = db.prepare(
      'SELECT id, age, gender, education, marital_status, income, race, occupation, region, kids FROM seed_records WHERE dataset = ? LIMIT 20'
    ).all(ds.dataset);
    writeJson(`data/datasets/${ds.dataset}/samples.json`, samples);
  }

  // 7. Per-experiment results data
  for (const exp of experiments) {
    const id = exp.id;

    // Personas
    const personas = db.prepare(`
      SELECT p.*, s.age, s.gender, s.education, s.marital_status, s.income, s.race
      FROM personas p LEFT JOIN seed_records s ON p.seed_record_id = s.id
      WHERE p.experiment_id = ?
    `).all(id);
    writeJson(`data/results/${id}/personas.json`, personas);

    // Responses
    const responses = db.prepare(`
      SELECT r.*, p.model_id, p.backstory
      FROM responses r JOIN personas p ON r.persona_id = p.id
      WHERE p.experiment_id = ? ORDER BY p.id, r.id
    `).all(id);
    writeJson(`data/results/${id}/responses.json`, responses);

    // Costs
    const costs = getExperimentCost(db, id);
    writeJson(`data/results/${id}/costs.json`, costs);

    // Validation (stored records)
    const validations = db.prepare('SELECT * FROM validations WHERE experiment_id = ? ORDER BY dimension, metric').all(id);
    writeJson(`data/results/${id}/validations.json`, validations);

    // Validation report - we'll compute a simplified version
    const totalR = (responses as any[]).length;
    const validR = (responses as any[]).filter((r: any) => r.is_valid).length;
    const validRate = totalR > 0 ? validR / totalR : 0;
    const reasons: Record<string, number> = {};
    (responses as any[]).filter((r: any) => !r.is_valid && r.rejection_reason).forEach((r: any) => {
      reasons[r.rejection_reason] = (reasons[r.rejection_reason] || 0) + 1;
    });

    // Distributional from stored validations
    const distributional: any[] = [];
    const byDim: Record<string, Record<string, any>> = {};
    (validations as any[]).forEach((v: any) => {
      if (!byDim[v.dimension]) byDim[v.dimension] = {};
      byDim[v.dimension][v.metric] = v;
    });
    for (const [dim, metrics] of Object.entries(byDim)) {
      const chi = metrics.chi_squared;
      const kl = metrics.kl_divergence;
      if (chi) {
        const details = chi.details_json ? JSON.parse(chi.details_json) : {};
        distributional.push({
          dimension: dim,
          chiSquared: details,
          kl: kl?.details_json ? JSON.parse(kl.details_json) : { divergence: kl?.value || 0, quality: 'unknown' },
          passed: !!chi.passed,
        });
      }
    }

    // Biases placeholder
    const biases: any[] = [];

    // Compute score
    let score = 100;
    if (validRate < 0.9) score -= (1 - validRate) * 30;
    const distPassed = distributional.filter(d => d.passed).length;
    if (distributional.length > 0) score -= (1 - distPassed / distributional.length) * 30;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const overallVerdict = score >= 70 ? 'pass' : score >= 50 ? 'marginal' : 'fail';
    const effectiveHumanEquivalent = Math.round((exp.persona_count || 100) * validRate * (score / 100));

    const report = {
      experimentId: id,
      filtering: { total: totalR, valid: validR, filtered: totalR - validR, reasons, validRate },
      distributional,
      variance: [],
      biases,
      overallScore: score,
      overallVerdict,
      effectiveHumanEquivalent,
    };
    writeJson(`data/results/${id}/validation.json`, report);

    // Export JSON
    writeJson(`data/results/${id}/export.json`, { experiment: exp, personas, responses, costs, report });

    // Single experiment lookup
    writeJson(`data/experiments/${id}.json`, exp);
  }

  // 8. Full analysis endpoint per experiment (the heavy one)
  for (const exp of experiments) {
    const id = exp.id;
    console.log(`\nGenerating analysis for experiment ${id}: ${exp.name}...`);

    const config = exp.config_json ? JSON.parse(exp.config_json) : {};

    // Demographics of sampled personas
    const demographics: Record<string, any[]> = {};
    const dimQueries: Record<string, string> = {
      age: `SELECT CASE WHEN s.age < 25 THEN '18-24' WHEN s.age < 35 THEN '25-34' WHEN s.age < 45 THEN '35-44' WHEN s.age < 55 THEN '45-54' WHEN s.age < 65 THEN '55-64' ELSE '65+' END as bin, COUNT(*) as count FROM personas p JOIN seed_records s ON p.seed_record_id = s.id WHERE p.experiment_id = ? AND s.age IS NOT NULL GROUP BY bin ORDER BY MIN(s.age)`,
      income: `SELECT CASE WHEN s.income < 25000 THEN '<\$25K' WHEN s.income < 50000 THEN '\$25-50K' WHEN s.income < 75000 THEN '\$50-75K' WHEN s.income < 100000 THEN '\$75-100K' ELSE '\$100K+' END as bin, COUNT(*) as count FROM personas p JOIN seed_records s ON p.seed_record_id = s.id WHERE p.experiment_id = ? AND s.income IS NOT NULL GROUP BY bin`,
      education: `SELECT s.education as bin, COUNT(*) as count FROM personas p JOIN seed_records s ON p.seed_record_id = s.id WHERE p.experiment_id = ? AND s.education IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      marital_status: `SELECT s.marital_status as bin, COUNT(*) as count FROM personas p JOIN seed_records s ON p.seed_record_id = s.id WHERE p.experiment_id = ? AND s.marital_status IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      race: `SELECT s.race as bin, COUNT(*) as count FROM personas p JOIN seed_records s ON p.seed_record_id = s.id WHERE p.experiment_id = ? AND s.race IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      gender: `SELECT s.gender as bin, COUNT(*) as count FROM personas p JOIN seed_records s ON p.seed_record_id = s.id WHERE p.experiment_id = ? AND s.gender IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      region: `SELECT s.region as bin, COUNT(*) as count FROM personas p JOIN seed_records s ON p.seed_record_id = s.id WHERE p.experiment_id = ? AND s.region IS NOT NULL GROUP BY bin ORDER BY count DESC`,
    };
    for (const [dim, sql] of Object.entries(dimQueries)) {
      demographics[dim] = db.prepare(sql).all(id) as any[];
    }

    // Per-question analysis
    const questions = db.prepare(`
      SELECT DISTINCT r.question_id, r.question_text, r.question_type
      FROM responses r JOIN personas p ON r.persona_id = p.id
      WHERE p.experiment_id = ? AND r.question_id NOT LIKE '%_followup'
      ORDER BY r.id
    `).all(id) as any[];

    const perQuestion = questions.map((q: any) => {
      const valueDist = db.prepare(`
        SELECT r.parsed_value as value, COUNT(*) as count
        FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
        GROUP BY r.parsed_value ORDER BY r.parsed_value
      `).all(id, q.question_id) as any[];

      const stats = db.prepare(`
        SELECT AVG(r.parsed_value) as mean, COUNT(*) as n, MIN(r.parsed_value) as min_val, MAX(r.parsed_value) as max_val
        FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
      `).get(id, q.question_id) as any;

      const values = db.prepare(`
        SELECT r.parsed_value as v FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
      `).all(id, q.question_id) as any[];
      const mean = stats?.mean || 0;
      const stddev = values.length > 1 ? Math.sqrt(values.reduce((s: number, r: any) => s + Math.pow(r.v - mean, 2), 0) / (values.length - 1)) : 0;

      const byModel = db.prepare(`
        SELECT p.model_id, AVG(r.parsed_value) as mean, COUNT(*) as n
        FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
        GROUP BY p.model_id ORDER BY mean DESC
      `).all(id, q.question_id) as any[];

      const rejections = db.prepare(`
        SELECT r.rejection_reason as reason, COUNT(*) as count
        FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 0
        GROUP BY r.rejection_reason
      `).all(id, q.question_id) as any[];

      const followups = db.prepare(`
        SELECT r.raw_response, p.model_id FROM responses r JOIN personas p ON r.persona_id = p.id
        WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 ORDER BY RANDOM() LIMIT 5
      `).all(id, q.question_id + '_followup') as any[];

      const samples = db.prepare(`
        SELECT r.raw_response, r.parsed_value, r.likert_value, p.model_id, p.backstory,
          s.age, s.income, s.education, s.race, s.gender
        FROM responses r JOIN personas p ON r.persona_id = p.id
        LEFT JOIN seed_records s ON p.seed_record_id = s.id
        WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 ORDER BY RANDOM() LIMIT 8
      `).all(id, q.question_id) as any[];

      return {
        ...q,
        distribution: valueDist,
        stats: { mean, stddev, n: stats?.n || 0, min: stats?.min_val, max: stats?.max_val },
        byModel: byModel.map((m: any) => ({ ...m, modelName: modelName(m.model_id) })),
        rejections,
        followupSamples: followups,
        responseSamples: samples,
      };
    });

    // Filter summary
    const filterSummary = db.prepare(`
      SELECT r.is_valid, r.rejection_reason, COUNT(*) as count
      FROM responses r JOIN personas p ON r.persona_id = p.id
      WHERE p.experiment_id = ? GROUP BY r.is_valid, r.rejection_reason ORDER BY count DESC
    `).all(id) as any[];

    // Model rejections
    const modelRejections = db.prepare(`
      SELECT p.model_id, r.is_valid, COUNT(*) as count
      FROM responses r JOIN personas p ON r.persona_id = p.id
      WHERE p.experiment_id = ? GROUP BY p.model_id, r.is_valid
    `).all(id) as any[];

    // Model distribution
    const modelDist = db.prepare(`SELECT model_id, COUNT(*) as count FROM personas WHERE experiment_id = ? GROUP BY model_id ORDER BY count DESC`).all(id) as any[];

    // Validations
    const validations = db.prepare('SELECT * FROM validations WHERE experiment_id = ? ORDER BY dimension, metric').all(id);

    // Costs
    const costs = getExperimentCost(db, id);

    // Backstory samples
    const backstorySamples = db.prepare(`
      SELECT p.id, p.model_id, p.backstory, s.age, s.income, s.education, s.marital_status, s.race, s.gender, s.region
      FROM personas p LEFT JOIN seed_records s ON p.seed_record_id = s.id
      WHERE p.experiment_id = ? ORDER BY RANDOM() LIMIT 10
    `).all(id) as any[];

    // Skew analysis
    const skewAnalysis = perQuestion
      .filter((q: any) => q.question_type === 'likert' && q.stats.n > 10)
      .map((q: any) => ({
        questionId: q.question_id,
        mean: q.stats.mean,
        midpoint: 4,
        skew: q.stats.mean - 4,
        direction: q.stats.mean > 4.5 ? 'positive' : q.stats.mean < 3.5 ? 'negative' : 'neutral',
      }));

    // Response lengths
    const responseLengths = db.prepare(`
      SELECT p.model_id, AVG(LENGTH(r.raw_response)) as avg_length, MIN(LENGTH(r.raw_response)) as min_length, MAX(LENGTH(r.raw_response)) as max_length
      FROM responses r JOIN personas p ON r.persona_id = p.id
      WHERE p.experiment_id = ? AND r.is_valid = 1 GROUP BY p.model_id
    `).all(id) as any[];

    // Seed comparison
    const seedDataset = exp.dataset;
    const filter = config.filter || {};
    const seedFilterDatasets = filter.datasets || [seedDataset];

    const seedSubgroupWhere: string[] = [`dataset IN (${seedFilterDatasets.map(() => '?').join(',')})`];
    const seedParams: unknown[] = [...seedFilterDatasets];
    for (const col of ['race', 'gender', 'marital_status', 'education', 'region']) {
      const val = filter[col];
      if (val) {
        const arr = Array.isArray(val) ? val : [val];
        seedSubgroupWhere.push(`${col} IN (${arr.map(() => '?').join(',')})`);
        seedParams.push(...arr);
      }
    }
    if (filter.income_min != null) { seedSubgroupWhere.push('income >= ?'); seedParams.push(filter.income_min); }
    if (filter.income_max != null) { seedSubgroupWhere.push('income < ?'); seedParams.push(filter.income_max); }
    if (filter.age_min != null) { seedSubgroupWhere.push('age >= ?'); seedParams.push(filter.age_min); }
    if (filter.age_max != null) { seedSubgroupWhere.push('age < ?'); seedParams.push(filter.age_max); }
    if (filter.kids_min != null) { seedSubgroupWhere.push('kids >= ?'); seedParams.push(filter.kids_min); }

    const seedWhere = seedSubgroupWhere.join(' AND ');
    const seedTotal = (db.prepare(`SELECT COUNT(*) as n FROM seed_records WHERE ${seedWhere}`).get(...seedParams) as any).n;

    const seedDemographics: Record<string, any[]> = {};
    const seedDimQueries: Record<string, string> = {
      age: `SELECT CASE WHEN age < 25 THEN '18-24' WHEN age < 35 THEN '25-34' WHEN age < 45 THEN '35-44' WHEN age < 55 THEN '45-54' WHEN age < 65 THEN '55-64' ELSE '65+' END as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND age IS NOT NULL GROUP BY bin ORDER BY MIN(age)`,
      income: `SELECT CASE WHEN income < 25000 THEN '<\$25K' WHEN income < 50000 THEN '\$25-50K' WHEN income < 75000 THEN '\$50-75K' WHEN income < 100000 THEN '\$75-100K' ELSE '\$100K+' END as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND income IS NOT NULL GROUP BY bin`,
      education: `SELECT education as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND education IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      marital_status: `SELECT marital_status as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND marital_status IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      race: `SELECT race as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND race IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      gender: `SELECT gender as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND gender IS NOT NULL GROUP BY bin ORDER BY count DESC`,
      region: `SELECT region as bin, COUNT(*) as count FROM seed_records WHERE ${seedWhere} AND region IS NOT NULL GROUP BY bin ORDER BY count DESC`,
    };
    for (const [dim, sql] of Object.entries(seedDimQueries)) {
      const rows = db.prepare(sql).all(...seedParams) as any[];
      const total = rows.reduce((s: number, r: any) => s + r.count, 0);
      seedDemographics[dim] = rows.map((r: any) => ({ bin: r.bin, count: r.count, pct: total > 0 ? r.count / total * 100 : 0 }));
    }

    const seedStats = db.prepare(`SELECT AVG(age) as avg_age, AVG(income) as avg_income, MIN(age) as min_age, MAX(age) as max_age, MIN(income) as min_income, MAX(income) as max_income FROM seed_records WHERE ${seedWhere}`).get(...seedParams) as any;
    const synthStats = db.prepare(`SELECT AVG(s.age) as avg_age, AVG(s.income) as avg_income, MIN(s.age) as min_age, MAX(s.age) as max_age, MIN(s.income) as min_income, MAX(s.income) as max_income FROM personas p JOIN seed_records s ON p.seed_record_id = s.id WHERE p.experiment_id = ?`).get(id) as any;

    // Diagnostics
    const diagnostics: any[] = [];
    const totalR = filterSummary.reduce((s: number, r: any) => s + r.count, 0);
    const validR = filterSummary.filter((r: any) => r.is_valid === 1).reduce((s: number, r: any) => s + r.count, 0);
    const vRate = totalR > 0 ? validR / totalR : 0;

    if (vRate > 0.95) diagnostics.push({ type: 'success', title: 'High validity rate', detail: `${(vRate*100).toFixed(1)}% of responses were valid. The LLMs stayed in character well.` });
    else if (vRate > 0.9) diagnostics.push({ type: 'info', title: 'Good validity rate', detail: `${(vRate*100).toFixed(1)}% valid. Some refusals detected.` });
    else diagnostics.push({ type: 'warning', title: 'Lower validity rate', detail: `${(vRate*100).toFixed(1)}% valid. High refusal rate.` });

    const refusalCount = filterSummary.filter((r: any) => r.rejection_reason === 'refusal').reduce((s: number, r: any) => s + r.count, 0);
    if (refusalCount > 20) diagnostics.push({ type: 'warning', title: `${refusalCount} refusals detected`, detail: 'LLMs broke character. Consider base models or prompt adjustments.' });

    if (seedTotal < 200) diagnostics.push({ type: 'warning', title: 'Small seed subgroup', detail: `Only ${seedTotal} records match filter. May not capture full variance.` });

    const chiResults = (validations as any[]).filter((v: any) => v.metric === 'chi_squared');
    const chiFails = chiResults.filter((v: any) => !v.passed);
    if (chiFails.length > 0 && exp.persona_count <= 100) diagnostics.push({ type: 'info', title: 'Chi-squared failures may be expected', detail: `With ${exp.persona_count} personas from ${seedTotal} records, some mismatch is expected from sampling noise.` });

    const posSkew = skewAnalysis.filter((s: any) => s.direction === 'positive');
    const negSkew = skewAnalysis.filter((s: any) => s.direction === 'negative');
    if (posSkew.length > negSkew.length + 1) diagnostics.push({ type: 'warning', title: 'Social desirability bias detected', detail: `${posSkew.length}/${skewAnalysis.length} Likert questions skew above midpoint.` });
    else if (negSkew.length > posSkew.length + 1) diagnostics.push({ type: 'warning', title: 'Negative skew detected', detail: `${negSkew.length}/${skewAnalysis.length} questions skew below midpoint.` });
    else if (skewAnalysis.length > 0) diagnostics.push({ type: 'success', title: 'Balanced response distribution', detail: 'Likert responses are balanced around midpoint.' });

    if (modelDist.length < 3) diagnostics.push({ type: 'info', title: 'Low model diversity', detail: 'Fewer than 3 models used.' });

    const modelMeans: Record<string, { sum: number; n: number }> = {};
    perQuestion.filter((q: any) => q.question_type === 'likert').forEach((q: any) => {
      q.byModel.forEach((m: any) => {
        if (!modelMeans[m.modelName]) modelMeans[m.modelName] = { sum: 0, n: 0 };
        modelMeans[m.modelName].sum += m.mean * m.n;
        modelMeans[m.modelName].n += m.n;
      });
    });
    const modelAvgs = Object.entries(modelMeans).map(([name, v]) => ({ name, avg: v.sum / v.n })).sort((a, b) => b.avg - a.avg);
    if (modelAvgs.length >= 2) {
      const range = modelAvgs[0].avg - modelAvgs[modelAvgs.length - 1].avg;
      if (range > 0.5) diagnostics.push({ type: 'info', title: `Model spread: ${range.toFixed(2)} points`, detail: `${modelAvgs[0].name} most optimistic (${modelAvgs[0].avg.toFixed(2)}), ${modelAvgs[modelAvgs.length-1].name} most conservative (${modelAvgs[modelAvgs.length-1].avg.toFixed(2)}).` });
    }

    writeJson(`data/analysis/${id}.json`, {
      experiment: exp,
      config,
      demographics,
      perQuestion,
      filterSummary,
      modelRejections,
      modelDist: modelDist.map((m: any) => ({ ...m, modelName: modelName(m.model_id) })),
      validations,
      costs,
      backstorySamples,
      skewAnalysis,
      responseLengths: responseLengths.map((r: any) => ({ ...r, modelName: modelName(r.model_id) })),
      seedComparison: { seedTotal, seedDemographics, seedStats, synthStats },
      diagnostics,
    });
  }

  // 9. Generate analysis/summary.json (for methodology page)
  console.log('\nGenerating methodology summary...');
  const totalPersonas = experiments.reduce((s: number, e: any) => s + (e.persona_count_actual || 0), 0);
  const totalCost = experiments.reduce((s: number, e: any) => s + (e.total_cost || 0), 0);
  const costPerPersona = totalPersonas > 0 ? totalCost / totalPersonas : 0;

  const responseStats = db.prepare(`
    SELECT COUNT(*) as total, SUM(CASE WHEN r.is_valid = 1 THEN 1 ELSE 0 END) as valid
    FROM responses r JOIN personas p ON r.persona_id = p.id
    JOIN experiments e ON p.experiment_id = e.id WHERE e.status = 'completed'
  `).get() as any;

  const seedStatsTotal = db.prepare('SELECT COUNT(*) as total FROM seed_records').get() as any;
  const datasetBreakdown = db.prepare('SELECT dataset, COUNT(*) as count FROM seed_records GROUP BY dataset ORDER BY count DESC').all() as any[];

  const experimentSummaries = experiments.filter((e: any) => e.status === 'completed').map((e: any) => {
    const cfg = e.config_json ? JSON.parse(e.config_json) : {};
    const filter = cfg.filter || {};
    const costs = getExperimentCost(db, e.id);
    const vals = db.prepare('SELECT * FROM validations WHERE experiment_id = ?').all(e.id) as any[];
    const chiR = vals.filter((v: any) => v.metric === 'chi_squared');
    const chiP = chiR.filter((v: any) => v.passed).length;

    const er = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN r.is_valid = 1 THEN 1 ELSE 0 END) as valid FROM responses r JOIN personas p ON r.persona_id = p.id WHERE p.experiment_id = ?`).get(e.id) as any;
    const vr = er.total > 0 ? er.valid / er.total : 0;

    const seedFilterDatasets = filter.datasets || [e.dataset];
    const swp: string[] = [`dataset IN (${seedFilterDatasets.map(() => '?').join(',')})`];
    const sp: unknown[] = [...seedFilterDatasets];
    for (const col of ['race', 'gender', 'marital_status', 'education', 'region']) {
      const val = filter[col];
      if (val) { const arr = Array.isArray(val) ? val : [val]; swp.push(`${col} IN (${arr.map(() => '?').join(',')})`); sp.push(...arr); }
    }
    if (filter.income_min != null) { swp.push('income >= ?'); sp.push(filter.income_min); }
    if (filter.income_max != null) { swp.push('income < ?'); sp.push(filter.income_max); }
    const seedPool = (db.prepare(`SELECT COUNT(*) as n FROM seed_records WHERE ${swp.join(' AND ')}`).get(...sp) as any).n;

    let score = 100;
    if (vr < 0.9) score -= (1 - vr) * 30;
    if (chiR.length > 0) score -= (1 - chiP / chiR.length) * 30;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      id: e.id,
      name: e.name,
      dataset: e.dataset,
      personaCount: e.persona_count_actual,
      totalCost: costs.totalCost,
      costPerPersona: costs.totalCost / (e.persona_count_actual || 1),
      validRate: vr,
      chiPassed: chiP,
      chiTotal: chiR.length,
      seedPoolSize: seedPool,
      score,
      verdict: score >= 70 ? 'pass' : score >= 50 ? 'marginal' : 'fail',
      effectiveHumanEquiv: Math.round((e.persona_count_actual || 0) * vr * (score / 100)),
      filter,
      models: JSON.parse(e.model_ids),
    };
  });

  const modelUsage = db.prepare(`
    SELECT p.model_id, COUNT(*) as personas,
      (SELECT COALESCE(SUM(c.cost), 0) FROM cost_log c WHERE c.model_id = p.model_id) as cost
    FROM personas p JOIN experiments e ON p.experiment_id = e.id
    WHERE e.status = 'completed' GROUP BY p.model_id
  `).all() as any[];

  writeJson('data/analysis/summary.json', {
    totalExperiments: experiments.filter((e: any) => e.status === 'completed').length,
    totalPersonas,
    totalCost,
    costPerPersona,
    totalResponses: responseStats.total,
    validResponses: responseStats.valid,
    overallValidRate: responseStats.total > 0 ? responseStats.valid / responseStats.total : 0,
    totalSeedRecords: seedStatsTotal.total,
    datasetBreakdown,
    experiments: experimentSummaries,
    modelUsage: modelUsage.map((m: any) => ({ ...m, modelName: modelName(m.model_id) })),
  });

  db.close();

  // Count output
  let fileCount = 0;
  let totalSize = 0;
  function countFiles(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) countFiles(path.join(dir, entry.name));
      else { fileCount++; totalSize += fs.statSync(path.join(dir, entry.name)).size; }
    }
  }
  countFiles(DIST);

  console.log(`\nBuild complete! ${fileCount} files, ${(totalSize / 1024 / 1024).toFixed(2)}MB total`);
  console.log(`Output: ${DIST}`);
  console.log('\nTo test locally: npx serve dist');
  console.log('To deploy: npx vercel');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
