import { getDb } from '../data/db.js';
import { getAllQuestionSets } from '../interview/question-bank.js';

/**
 * Post-hoc statistical calibration for social desirability bias.
 *
 * Two complementary approaches:
 *
 * 1. Self-calibration (direction gap method):
 *    Uses our own reverse-coded questions as an internal anchor.
 *    If positive-coded Likert mean = 6.2 and negative-coded = 3.0,
 *    the direction gap (3.2) far exceeds what real humans produce (~0.5-1.0).
 *    The excess gap = 3.2 - expectedHumanGap. We correct each direction by
 *    half the excess: positive-coded -= correction, negative-coded += correction.
 *
 * 2. External baseline calibration:
 *    When ground-truth human survey data is available for specific questions,
 *    we compute per-question shift factors (LLM mean - human mean) and apply them.
 *    This is more precise but requires matching human data.
 */

export interface CalibrationResult {
  method: 'self' | 'external' | 'combined';
  rawMean: number;
  calibratedMean: number;
  correctionApplied: number;
  directionGap: { raw: number; calibrated: number; expectedHuman: number };
  perDirection: {
    positive: { rawMean: number; calibratedMean: number; n: number };
    negative: { rawMean: number; calibratedMean: number; n: number };
    neutral: { rawMean: number; calibratedMean: number; n: number };
  };
  perQuestion: Array<{
    questionId: string;
    direction: 'positive' | 'negative' | 'neutral';
    rawMean: number;
    calibratedMean: number;
    correction: number;
    n: number;
    humanBaseline?: number;
  }>;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
}

/** Known human baseline means for specific questions (from published surveys). */
export interface HumanBaseline {
  questionId: string;
  mean: number;
  stdDev?: number;
  source: string; // e.g., "BLS CEX 2024", "Pew 2024", "GSS 2022"
  n?: number;
}

/**
 * Expected direction gap in real human populations.
 * Based on survey methodology literature:
 * - Paulhus (1991) Balanced Inventory of Desirable Responding: ~0.5-1.0 on 7-point scales
 * - Crowne-Marlowe Social Desirability Scale: ~0.3-0.8 gap
 * Conservative estimate: 0.8 points
 */
const EXPECTED_HUMAN_DIRECTION_GAP = 0.8;

/**
 * Minimum number of negative-coded questions needed for reliable self-calibration.
 */
const MIN_NEGATIVE_CODED_QUESTIONS = 2;

/**
 * Run post-hoc calibration on an experiment's Likert responses.
 */
export function calibrateExperiment(
  experimentId: number,
  humanBaselines?: HumanBaseline[]
): CalibrationResult {
  const db = getDb();
  const notes: string[] = [];

  // Build SD direction lookup from question bank
  const sdDirectionMap = new Map<string, 'positive' | 'negative' | 'neutral'>();
  for (const qs of getAllQuestionSets()) {
    for (const q of qs.questions) {
      if (q.type === 'likert' && q.socialDesirabilityDirection) {
        sdDirectionMap.set(q.id, q.socialDesirabilityDirection);
      }
    }
  }

  // Fetch all valid Likert responses
  const rows = db.prepare(`
    SELECT r.question_id, r.likert_value
    FROM responses r
    JOIN personas p ON r.persona_id = p.id
    WHERE p.experiment_id = ? AND r.question_type = 'likert' AND r.is_valid = 1 AND r.likert_value IS NOT NULL
  `).all(experimentId) as Array<{ question_id: string; likert_value: number }>;

  if (rows.length < 20) {
    return emptyResult('Insufficient data for calibration');
  }

  // Group by question
  const byQuestion = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byQuestion.get(r.question_id) || [];
    arr.push(r.likert_value);
    byQuestion.set(r.question_id, arr);
  }

  // Compute per-question raw means
  const questionStats = Array.from(byQuestion.entries()).map(([qid, vals]) => ({
    questionId: qid,
    direction: sdDirectionMap.get(qid) || 'neutral' as const,
    rawMean: vals.reduce((a, b) => a + b, 0) / vals.length,
    n: vals.length,
    values: vals,
  }));

  // Split by direction
  const positiveQs = questionStats.filter(q => q.direction === 'positive');
  const negativeQs = questionStats.filter(q => q.direction === 'negative');
  const neutralQs = questionStats.filter(q => q.direction === 'neutral');

  // --- Self-calibration ---
  const positiveMean = weightedMean(positiveQs);
  const negativeMean = weightedMean(negativeQs);
  const neutralMeanRaw = weightedMean(neutralQs);
  const allMeanRaw = weightedMean(questionStats);

  const rawDirectionGap = positiveMean !== null && negativeMean !== null
    ? positiveMean - negativeMean
    : null;

  let selfCorrection = 0;
  let canSelfCalibrate = false;

  if (rawDirectionGap !== null && negativeQs.length >= MIN_NEGATIVE_CODED_QUESTIONS) {
    canSelfCalibrate = true;
    const excessGap = Math.max(0, rawDirectionGap - EXPECTED_HUMAN_DIRECTION_GAP);
    selfCorrection = excessGap / 2;
    notes.push(`Self-calibration: direction gap ${rawDirectionGap.toFixed(2)} → excess ${excessGap.toFixed(2)} → correction ±${selfCorrection.toFixed(2)}`);
  } else {
    notes.push(`Self-calibration unavailable: need ≥${MIN_NEGATIVE_CODED_QUESTIONS} negative-coded questions, have ${negativeQs.length}`);
  }

  // --- External baseline calibration ---
  const baselineMap = new Map<string, HumanBaseline>();
  if (humanBaselines) {
    for (const b of humanBaselines) baselineMap.set(b.questionId, b);
  }

  const hasExternalBaselines = baselineMap.size > 0;
  if (hasExternalBaselines) {
    notes.push(`External baselines available for ${baselineMap.size} questions`);
  }

  // --- Compute per-question calibrated means ---
  const perQuestion: CalibrationResult['perQuestion'] = questionStats.map(q => {
    let correction = 0;
    const baseline = baselineMap.get(q.questionId);

    if (baseline) {
      // External baseline takes priority: correction = rawMean - humanMean
      correction = q.rawMean - baseline.mean;
      notes.push(`${q.questionId}: external calibration shift ${correction.toFixed(2)} (LLM ${q.rawMean.toFixed(2)} vs human ${baseline.mean.toFixed(2)})`);
    } else if (canSelfCalibrate) {
      // Self-calibration based on direction
      if (q.direction === 'positive') correction = selfCorrection;
      else if (q.direction === 'negative') correction = -selfCorrection;
      // neutral questions: apply a smaller correction (proportional to their distance from midpoint)
      else {
        const distFromMid = q.rawMean - 4.0;
        correction = distFromMid > 0 ? selfCorrection * 0.5 : distFromMid < 0 ? -selfCorrection * 0.5 : 0;
      }
    }

    return {
      questionId: q.questionId,
      direction: q.direction,
      rawMean: q.rawMean,
      calibratedMean: clampLikert(q.rawMean - correction),
      correction,
      n: q.n,
      humanBaseline: baseline?.mean,
    };
  });

  // --- Compute calibrated aggregates ---
  const calibratedPositiveMean = positiveMean !== null ? clampLikert(positiveMean - selfCorrection) : null;
  const calibratedNegativeMean = negativeMean !== null ? clampLikert(negativeMean + selfCorrection) : null;
  const calibratedNeutralMean = neutralMeanRaw !== null
    ? clampLikert(neutralMeanRaw - (canSelfCalibrate ? selfCorrection * 0.5 * Math.sign(neutralMeanRaw - 4.0) : 0))
    : null;

  const calibratedDirectionGap = calibratedPositiveMean !== null && calibratedNegativeMean !== null
    ? calibratedPositiveMean - calibratedNegativeMean
    : rawDirectionGap || 0;

  // Compute calibrated overall mean
  const totalN = questionStats.reduce((s, q) => s + q.n, 0);
  const calibratedOverall = perQuestion.reduce((s, q) => s + q.calibratedMean * q.n, 0) / totalN;

  // --- Confidence assessment ---
  let confidence: CalibrationResult['confidence'] = 'low';
  if (hasExternalBaselines && canSelfCalibrate) confidence = 'high';
  else if (canSelfCalibrate && negativeQs.length >= 3) confidence = 'medium';
  else if (canSelfCalibrate) confidence = 'low';

  const method: CalibrationResult['method'] = hasExternalBaselines && canSelfCalibrate
    ? 'combined'
    : hasExternalBaselines ? 'external' : 'self';

  return {
    method,
    rawMean: allMeanRaw || 4.0,
    calibratedMean: calibratedOverall,
    correctionApplied: selfCorrection,
    directionGap: {
      raw: rawDirectionGap || 0,
      calibrated: calibratedDirectionGap,
      expectedHuman: EXPECTED_HUMAN_DIRECTION_GAP,
    },
    perDirection: {
      positive: { rawMean: positiveMean || 0, calibratedMean: calibratedPositiveMean || 0, n: positiveQs.reduce((s, q) => s + q.n, 0) },
      negative: { rawMean: negativeMean || 0, calibratedMean: calibratedNegativeMean || 0, n: negativeQs.reduce((s, q) => s + q.n, 0) },
      neutral: { rawMean: neutralMeanRaw || 0, calibratedMean: calibratedNeutralMean || 0, n: neutralQs.reduce((s, q) => s + q.n, 0) },
    },
    perQuestion,
    confidence,
    notes,
  };
}

function weightedMean(questions: Array<{ rawMean: number; n: number }>): number | null {
  if (questions.length === 0) return null;
  const totalN = questions.reduce((s, q) => s + q.n, 0);
  if (totalN === 0) return null;
  return questions.reduce((s, q) => s + q.rawMean * q.n, 0) / totalN;
}

function clampLikert(val: number): number {
  return Math.max(1, Math.min(7, val));
}

function emptyResult(note: string): CalibrationResult {
  return {
    method: 'self',
    rawMean: 4.0,
    calibratedMean: 4.0,
    correctionApplied: 0,
    directionGap: { raw: 0, calibrated: 0, expectedHuman: EXPECTED_HUMAN_DIRECTION_GAP },
    perDirection: {
      positive: { rawMean: 0, calibratedMean: 0, n: 0 },
      negative: { rawMean: 0, calibratedMean: 0, n: 0 },
      neutral: { rawMean: 0, calibratedMean: 0, n: 0 },
    },
    perQuestion: [],
    confidence: 'low',
    notes: [note],
  };
}
