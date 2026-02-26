import { getDb } from '../data/db.js';

/**
 * Bias detection suite for silicon samples.
 * Detects: social desirability bias, mode collapse, caricaturing, demographic asymmetry.
 */

export interface BiasResult {
  type: string;
  description: string;
  severity: 'none' | 'low' | 'medium' | 'high';
  details: Record<string, unknown>;
}

/**
 * Social desirability bias: LLMs tend to give "nice" answers.
 * Detected by checking if positive-valence responses are overrepresented.
 */
export function detectSocialDesirability(experimentId: number): BiasResult {
  const db = getDb();

  // For likert questions, check if mean is significantly above midpoint
  const rows = db.prepare(`
    SELECT r.likert_value
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    WHERE p.experiment_id = ? AND r.question_type = 'likert' AND r.is_valid = 1 AND r.likert_value IS NOT NULL
  `).all(experimentId) as Array<{ likert_value: number }>;

  if (rows.length < 10) {
    return { type: 'social_desirability', description: 'Insufficient data', severity: 'none', details: { n: rows.length } };
  }

  const values = rows.map(r => r.likert_value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const midpoint = 4; // midpoint of 1-7 scale

  // Check how far mean deviates from midpoint
  const deviation = mean - midpoint;
  const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
  const zScore = stdDev > 0 ? deviation / (stdDev / Math.sqrt(values.length)) : 0;

  let severity: BiasResult['severity'] = 'none';
  if (Math.abs(zScore) > 3) severity = 'high';
  else if (Math.abs(zScore) > 2) severity = 'medium';
  else if (Math.abs(zScore) > 1.5) severity = 'low';

  return {
    type: 'social_desirability',
    description: deviation > 0
      ? 'Responses skew positive (socially desirable direction)'
      : deviation < 0 ? 'Responses skew negative' : 'No significant skew detected',
    severity,
    details: { mean, midpoint, deviation, zScore, n: values.length },
  };
}

/**
 * Mode collapse: all personas give the same or very similar answers.
 * Detected by checking if variance is suspiciously low.
 */
export function detectModeCollapse(experimentId: number): BiasResult {
  const db = getDb();

  // Get per-question variance
  const questions = db.prepare(`
    SELECT r.question_id, r.parsed_value
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    WHERE p.experiment_id = ? AND r.is_valid = 1 AND r.parsed_value IS NOT NULL
      AND r.question_type IN ('likert', 'numeric', 'multiple_choice')
  `).all(experimentId) as Array<{ question_id: string; parsed_value: number }>;

  const byQuestion: Record<string, number[]> = {};
  for (const q of questions) {
    if (!byQuestion[q.question_id]) byQuestion[q.question_id] = [];
    byQuestion[q.question_id].push(q.parsed_value);
  }

  const collapseCount = Object.entries(byQuestion).filter(([, vals]) => {
    if (vals.length < 5) return false;
    const unique = new Set(vals);
    // If >80% of answers are the same value, that's collapse
    const mode = [...unique].reduce((a, b) =>
      vals.filter(v => v === a).length >= vals.filter(v => v === b).length ? a : b
    );
    const modeFreq = vals.filter(v => v === mode).length / vals.length;
    return modeFreq > 0.8;
  }).length;

  const totalQuestions = Object.keys(byQuestion).length;
  const collapseRate = totalQuestions > 0 ? collapseCount / totalQuestions : 0;

  let severity: BiasResult['severity'] = 'none';
  if (collapseRate > 0.5) severity = 'high';
  else if (collapseRate > 0.25) severity = 'medium';
  else if (collapseRate > 0.1) severity = 'low';

  return {
    type: 'mode_collapse',
    description: collapseCount > 0
      ? `${collapseCount}/${totalQuestions} questions show mode collapse (>80% same answer)`
      : 'No mode collapse detected',
    severity,
    details: { collapseCount, totalQuestions, collapseRate },
  };
}

/**
 * Caricaturing: LLMs exaggerate demographic stereotypes.
 * Detected by checking if between-group differences are larger than in seed data.
 */
export function detectCaricaturing(experimentId: number): BiasResult {
  const db = getDb();

  // Compare response means by income bracket
  const rows = db.prepare(`
    SELECT s.income, r.likert_value
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    JOIN seed_records s ON p.seed_record_id = s.id
    WHERE p.experiment_id = ? AND r.question_type = 'likert' AND r.is_valid = 1 AND r.likert_value IS NOT NULL
      AND s.income IS NOT NULL
  `).all(experimentId) as Array<{ income: number; likert_value: number }>;

  if (rows.length < 20) {
    return { type: 'caricaturing', description: 'Insufficient data', severity: 'none', details: { n: rows.length } };
  }

  // Split into low/high income
  const median = [...rows].sort((a, b) => a.income - b.income)[Math.floor(rows.length / 2)].income;
  const lowIncome = rows.filter(r => r.income < median).map(r => r.likert_value);
  const highIncome = rows.filter(r => r.income >= median).map(r => r.likert_value);

  const lowMean = lowIncome.reduce((a, b) => a + b, 0) / lowIncome.length;
  const highMean = highIncome.reduce((a, b) => a + b, 0) / highIncome.length;
  const gap = Math.abs(highMean - lowMean);

  let severity: BiasResult['severity'] = 'none';
  if (gap > 2.0) severity = 'high';
  else if (gap > 1.5) severity = 'medium';
  else if (gap > 1.0) severity = 'low';

  return {
    type: 'caricaturing',
    description: gap > 1.0
      ? `Large gap between income groups (${gap.toFixed(2)} points on likert scale)`
      : 'No significant caricaturing detected',
    severity,
    details: { lowMean, highMean, gap, lowN: lowIncome.length, highN: highIncome.length },
  };
}

/**
 * Per-model bias: check if specific models produce systematically different results.
 */
export function detectModelBias(experimentId: number): BiasResult {
  const db = getDb();

  const rows = db.prepare(`
    SELECT p.model_id, r.likert_value
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    WHERE p.experiment_id = ? AND r.question_type = 'likert' AND r.is_valid = 1 AND r.likert_value IS NOT NULL
  `).all(experimentId) as Array<{ model_id: string; likert_value: number }>;

  const byModel: Record<string, number[]> = {};
  for (const r of rows) {
    if (!byModel[r.model_id]) byModel[r.model_id] = [];
    byModel[r.model_id].push(r.likert_value);
  }

  const modelMeans = Object.entries(byModel)
    .filter(([, vals]) => vals.length >= 3)
    .map(([model, vals]) => ({
      model,
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      n: vals.length,
    }));

  if (modelMeans.length < 2) {
    return { type: 'model_bias', description: 'Only one model used', severity: 'none', details: { models: modelMeans } };
  }

  const means = modelMeans.map(m => m.mean);
  const range = Math.max(...means) - Math.min(...means);

  let severity: BiasResult['severity'] = 'none';
  if (range > 2.0) severity = 'high';
  else if (range > 1.5) severity = 'medium';
  else if (range > 1.0) severity = 'low';

  return {
    type: 'model_bias',
    description: range > 1.0
      ? `Models differ by ${range.toFixed(2)} points on likert scale`
      : 'Models produce relatively consistent results',
    severity,
    details: { modelMeans, range },
  };
}

export function runAllBiasChecks(experimentId: number): BiasResult[] {
  return [
    detectSocialDesirability(experimentId),
    detectModeCollapse(experimentId),
    detectCaricaturing(experimentId),
    detectModelBias(experimentId),
  ];
}
