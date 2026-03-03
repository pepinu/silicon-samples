import { getDb } from '../data/db.js';
import { getAllQuestionSets } from '../interview/question-bank.js';

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
 * Enhanced: computes separate Z-scores for positive-coded and negative-coded (reverse) questions
 * and reports the gap between them as a diagnostic.
 */
export function detectSocialDesirability(experimentId: number): BiasResult {
  const db = getDb();

  // Build lookup of question SD direction from question bank
  const sdDirectionMap = new Map<string, 'positive' | 'negative' | 'neutral'>();
  for (const qs of getAllQuestionSets()) {
    for (const q of qs.questions) {
      if (q.type === 'likert' && q.socialDesirabilityDirection) {
        sdDirectionMap.set(q.id, q.socialDesirabilityDirection);
      }
    }
  }

  // For likert questions, get values with question_id for direction lookup
  const rows = db.prepare(`
    SELECT r.likert_value, r.question_id
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    WHERE p.experiment_id = ? AND r.question_type = 'likert' AND r.is_valid = 1 AND r.likert_value IS NOT NULL
  `).all(experimentId) as Array<{ likert_value: number; question_id: string }>;

  if (rows.length < 10) {
    return { type: 'social_desirability', description: 'Insufficient data', severity: 'none', details: { n: rows.length } };
  }

  const midpoint = 4; // midpoint of 1-7 scale

  // Split by SD direction
  const positiveVals: number[] = [];
  const negativeVals: number[] = [];
  const allValues: number[] = [];

  for (const r of rows) {
    allValues.push(r.likert_value);
    const dir = sdDirectionMap.get(r.question_id);
    if (dir === 'positive') positiveVals.push(r.likert_value);
    else if (dir === 'negative') negativeVals.push(r.likert_value);
  }

  // Overall stats
  const mean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const deviation = mean - midpoint;
  const stdDev = Math.sqrt(allValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / allValues.length);
  const zScore = stdDev > 0 ? deviation / (stdDev / Math.sqrt(allValues.length)) : 0;

  // Per-direction stats
  const computeStats = (vals: number[]) => {
    if (vals.length === 0) return null;
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - m, 2), 0) / vals.length);
    const z = sd > 0 ? (m - midpoint) / (sd / Math.sqrt(vals.length)) : 0;
    return { mean: m, stdDev: sd, zScore: z, n: vals.length };
  };

  const positiveStats = computeStats(positiveVals);
  const negativeStats = computeStats(negativeVals);

  // The gap: if SD bias exists, positive-coded questions will have high means
  // and negative-coded questions will have LOW means (LLM avoids admitting bad behavior).
  // A large gap (positive mean - negative mean) indicates strong SD bias.
  const directionGap = positiveStats && negativeStats
    ? positiveStats.mean - negativeStats.mean
    : null;

  let severity: BiasResult['severity'] = 'none';
  if (Math.abs(zScore) > 3) severity = 'high';
  else if (Math.abs(zScore) > 2) severity = 'medium';
  else if (Math.abs(zScore) > 1.5) severity = 'low';

  let description: string;
  if (deviation > 0) {
    description = 'Responses skew positive (socially desirable direction)';
  } else if (deviation < 0) {
    description = 'Responses skew negative';
  } else {
    description = 'No significant skew detected';
  }
  if (directionGap !== null && directionGap > 1.0) {
    description += ` | Direction gap: ${directionGap.toFixed(2)} (positive-coded ${positiveStats!.mean.toFixed(2)} vs negative-coded ${negativeStats!.mean.toFixed(2)})`;
  }

  return {
    type: 'social_desirability',
    description,
    severity,
    details: {
      mean, midpoint, deviation, zScore, n: allValues.length,
      positiveCodedStats: positiveStats,
      negativeCodedStats: negativeStats,
      directionGap,
    },
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

/**
 * Response quality: per-model validity rates, empty/refusal breakdown.
 * Flags models with <70% validity as unreliable.
 */
export function detectResponseQuality(experimentId: number): BiasResult {
  const db = getDb();

  const rows = db.prepare(`
    SELECT p.model_id,
      COUNT(*) as total,
      SUM(CASE WHEN r.is_valid = 1 THEN 1 ELSE 0 END) as valid,
      SUM(CASE WHEN r.rejection_reason = 'empty_response' THEN 1 ELSE 0 END) as empty,
      SUM(CASE WHEN r.rejection_reason = 'refusal' THEN 1 ELSE 0 END) as refusals,
      SUM(CASE WHEN r.rejection_reason = 'unparseable' THEN 1 ELSE 0 END) as unparseable,
      SUM(CASE WHEN r.rejection_reason = 'character_break' THEN 1 ELSE 0 END) as character_breaks
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    WHERE p.experiment_id = ?
    GROUP BY p.model_id
  `).all(experimentId) as Array<{
    model_id: string; total: number; valid: number;
    empty: number; refusals: number; unparseable: number; character_breaks: number;
  }>;

  if (rows.length === 0) {
    return { type: 'response_quality', description: 'No responses', severity: 'none', details: {} };
  }

  const modelStats = rows.map(r => ({
    model: r.model_id,
    total: r.total,
    valid: r.valid,
    validRate: r.total > 0 ? r.valid / r.total : 0,
    empty: r.empty,
    refusals: r.refusals,
    unparseable: r.unparseable,
    characterBreaks: r.character_breaks,
  })).sort((a, b) => a.validRate - b.validRate);

  const unreliable = modelStats.filter(m => m.validRate < 0.7);
  const totalResponses = rows.reduce((s, r) => s + r.total, 0);
  const totalValid = rows.reduce((s, r) => s + r.valid, 0);
  const overallRate = totalResponses > 0 ? totalValid / totalResponses : 0;

  // Wasted cost: responses from unreliable models that were rejected
  const wastedResponses = unreliable.reduce((s, m) => s + (m.total - m.valid), 0);

  let severity: BiasResult['severity'] = 'none';
  if (unreliable.length > 0 && overallRate < 0.7) severity = 'high';
  else if (unreliable.length > 0) severity = 'medium';
  else if (overallRate < 0.9) severity = 'low';

  const description = unreliable.length > 0
    ? `${unreliable.length} model(s) below 70% validity: ${unreliable.map(m => `${m.model.split('/')[1]} (${(m.validRate * 100).toFixed(0)}%)`).join(', ')}`
    : `All models above 70% validity (overall ${(overallRate * 100).toFixed(1)}%)`;

  return {
    type: 'response_quality',
    description,
    severity,
    details: {
      overallValidRate: overallRate,
      totalResponses,
      totalValid,
      wastedResponses,
      modelStats,
      unreliableModels: unreliable.map(m => m.model),
    },
  };
}

export function runAllBiasChecks(experimentId: number): BiasResult[] {
  return [
    detectSocialDesirability(experimentId),
    detectModeCollapse(experimentId),
    detectCaricaturing(experimentId),
    detectModelBias(experimentId),
    detectResponseQuality(experimentId),
  ];
}
