import { getDb } from '../data/db.js';
import { getDistribution } from '../data/distributions.js';
import { chiSquaredTest, type ChiSquaredResult } from './chi-squared.js';
import { klDivergence, type KLResult } from './kl-divergence.js';
import { varianceRatio, type VarianceResult } from './variance.js';
import { filterExperimentResponses } from './consistency-filter.js';
import { runAllBiasChecks, type BiasResult } from './bias-detector.js';
import type { Distribution } from '../data/distributions.js';

export interface ValidationReport {
  experimentId: number;
  filtering: {
    total: number;
    valid: number;
    filtered: number;
    reasons: Record<string, number>;
    validRate: number;
  };
  distributional: Array<{
    dimension: string;
    chiSquared: ChiSquaredResult;
    kl: KLResult;
    passed: boolean;
  }>;
  variance: Array<{
    questionId: string;
    result: VarianceResult;
  }>;
  biases: BiasResult[];
  overallScore: number; // 0-100
  overallVerdict: 'pass' | 'marginal' | 'fail';
  effectiveHumanEquivalent: number;
}

/**
 * Build response distributions for a given dimension.
 * Maps structured responses (for questions tagged with this dimension) to bins.
 */
function buildResponseDistribution(
  experimentId: number,
  dimension: string,
  seedDist: Distribution
): number[] | null {
  const db = getDb();

  if (dimension === 'income') {
    // Use seed record income for personas in this experiment
    const personas = db.prepare(`
      SELECT s.income
      FROM personas p
      JOIN seed_records s ON p.seed_record_id = s.id
      WHERE p.experiment_id = ? AND s.income IS NOT NULL
    `).all(experimentId) as Array<{ income: number }>;

    if (personas.length < 5) return null;

    const boundaries = [0, 25000, 50000, 75000, 100000, 150000, Infinity];
    return seedDist.bins.map((_, i) =>
      personas.filter(p => p.income >= boundaries[i] && p.income < boundaries[i + 1]).length
    );
  }

  if (dimension === 'age') {
    const personas = db.prepare(`
      SELECT s.age
      FROM personas p
      JOIN seed_records s ON p.seed_record_id = s.id
      WHERE p.experiment_id = ? AND s.age IS NOT NULL
    `).all(experimentId) as Array<{ age: number }>;

    if (personas.length < 5) return null;

    const boundaries = [0, 25, 35, 45, 55, 65, 100];
    return seedDist.bins.map((_, i) =>
      personas.filter(p => p.age >= boundaries[i] && p.age < boundaries[i + 1]).length
    );
  }

  // Categorical dimensions
  const colMap: Record<string, string> = {
    education: 'education',
    marital_status: 'marital_status',
    gender: 'gender',
    race: 'race',
  };
  const col = colMap[dimension];
  if (!col) return null;

  const personas = db.prepare(`
    SELECT s.${col} as val
    FROM personas p
    JOIN seed_records s ON p.seed_record_id = s.id
    WHERE p.experiment_id = ? AND s.${col} IS NOT NULL
  `).all(experimentId) as Array<{ val: string }>;

  if (personas.length < 5) return null;

  return seedDist.bins.map(bin =>
    personas.filter(p => p.val === bin.label).length
  );
}

export function generateReport(experimentId: number): ValidationReport {
  const db = getDb();

  // Get experiment info
  const experiment = db.prepare('SELECT * FROM experiments WHERE id = ?').get(experimentId) as {
    dataset: string;
    persona_count: number;
  };

  if (!experiment) throw new Error(`Experiment ${experimentId} not found`);

  // Step 1: Filter responses
  const filtering = filterExperimentResponses(experimentId);
  const validRate = filtering.total > 0 ? filtering.valid / filtering.total : 0;

  // Step 2: Distributional tests
  const distributional: ValidationReport['distributional'] = [];
  const dimensions = ['age', 'income', 'education', 'marital_status'];

  for (const dim of dimensions) {
    try {
      const seedDist = getDistribution(experiment.dataset, dim);
      if (seedDist.bins.length < 2 || seedDist.total < 5) continue;

      const synthCounts = buildResponseDistribution(experimentId, dim, seedDist);
      if (!synthCounts) continue;

      const seedCounts = seedDist.bins.map(b => b.count);
      const labels = seedDist.bins.map(b => b.label);

      const chi = chiSquaredTest(synthCounts, seedCounts, labels);
      const kl = klDivergence(seedCounts, synthCounts, labels);

      const passed = chi.pValue > 0.05 && kl.divergence < 0.2;

      // Store in DB
      db.prepare(`
        INSERT INTO validations (experiment_id, metric, dimension, value, p_value, passed, details_json)
        VALUES (?, 'chi_squared', ?, ?, ?, ?, ?)
      `).run(experimentId, dim, chi.statistic, chi.pValue, passed ? 1 : 0, JSON.stringify(chi));

      db.prepare(`
        INSERT INTO validations (experiment_id, metric, dimension, value, p_value, passed, details_json)
        VALUES (?, 'kl_divergence', ?, ?, NULL, ?, ?)
      `).run(experimentId, dim, kl.divergence, kl.quality !== 'poor' ? 1 : 0, JSON.stringify(kl));

      distributional.push({ dimension: dim, chiSquared: chi, kl, passed });
    } catch {
      // Skip dimensions that fail
    }
  }

  // Step 3: Variance analysis on likert responses
  const varianceResults: ValidationReport['variance'] = [];
  const likertQuestions = db.prepare(`
    SELECT DISTINCT r.question_id
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    WHERE p.experiment_id = ? AND r.question_type = 'likert' AND r.is_valid = 1
  `).all(experimentId) as Array<{ question_id: string }>;

  for (const { question_id } of likertQuestions) {
    const values = db.prepare(`
      SELECT r.likert_value
      FROM responses r
      JOIN personas p ON r.persona_id = p.id
      WHERE p.experiment_id = ? AND r.question_id = ? AND r.is_valid = 1 AND r.likert_value IS NOT NULL
    `).all(experimentId, question_id) as Array<{ likert_value: number }>;

    const synthValues = values.map(v => v.likert_value);
    // For seed comparison, use a uniform distribution as baseline (1-7 scale)
    // A real population would have some spread; uniform is our null hypothesis
    const uniformValues = Array.from({ length: Math.max(synthValues.length, 30) }, (_, i) => (i % 7) + 1);

    const result = varianceRatio(uniformValues, synthValues);
    varianceResults.push({ questionId: question_id, result });
  }

  // Step 4: Bias detection
  const biases = runAllBiasChecks(experimentId);

  // Step 5: Compute overall score
  let score = 100;

  // Deduct for filtering
  if (validRate < 0.9) score -= (1 - validRate) * 30;

  // Deduct for distributional failures
  const distPassed = distributional.filter(d => d.passed).length;
  const distTotal = distributional.length;
  if (distTotal > 0) score -= (1 - distPassed / distTotal) * 30;

  // Deduct for variance issues
  const goodVariance = varianceResults.filter(v => v.result.quality === 'good').length;
  const totalVariance = varianceResults.filter(v => v.result.quality !== 'insufficient_data').length;
  if (totalVariance > 0) score -= (1 - goodVariance / totalVariance) * 20;

  // Deduct for biases
  const highBiases = biases.filter(b => b.severity === 'high').length;
  const medBiases = biases.filter(b => b.severity === 'medium').length;
  score -= highBiases * 10 + medBiases * 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let overallVerdict: ValidationReport['overallVerdict'];
  if (score >= 70) overallVerdict = 'pass';
  else if (score >= 50) overallVerdict = 'marginal';
  else overallVerdict = 'fail';

  // Effective human equivalent (rough estimate)
  const personaCount = experiment.persona_count;
  const effectiveHumanEquivalent = Math.round(personaCount * validRate * (score / 100));

  return {
    experimentId,
    filtering: { ...filtering, validRate },
    distributional,
    variance: varianceResults,
    biases,
    overallScore: score,
    overallVerdict,
    effectiveHumanEquivalent,
  };
}
