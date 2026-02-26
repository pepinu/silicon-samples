/**
 * Variance ratio test.
 * Detects under-dispersion (a common LLM failure mode where responses
 * cluster too tightly around the mean, producing less variance than real humans).
 *
 * Ratio = Var(synthetic) / Var(seed)
 * Ideal: ratio ≈ 1.0
 * ratio < 0.5 → under-dispersed (LLM too conservative)
 * ratio > 2.0 → over-dispersed (LLM too erratic)
 */

export interface VarianceResult {
  seedMean: number;
  seedVariance: number;
  syntheticMean: number;
  syntheticVariance: number;
  ratio: number;
  quality: 'good' | 'under_dispersed' | 'over_dispersed' | 'insufficient_data';
}

function computeStats(values: number[]): { mean: number; variance: number } {
  if (values.length === 0) return { mean: 0, variance: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return { mean, variance };
}

export function varianceRatio(seedValues: number[], syntheticValues: number[]): VarianceResult {
  if (seedValues.length < 5 || syntheticValues.length < 5) {
    return {
      seedMean: 0,
      seedVariance: 0,
      syntheticMean: 0,
      syntheticVariance: 0,
      ratio: 0,
      quality: 'insufficient_data',
    };
  }

  const seed = computeStats(seedValues);
  const synth = computeStats(syntheticValues);

  const ratio = seed.variance > 0 ? synth.variance / seed.variance : 0;

  let quality: VarianceResult['quality'];
  if (ratio >= 0.5 && ratio <= 2.0) quality = 'good';
  else if (ratio < 0.5) quality = 'under_dispersed';
  else quality = 'over_dispersed';

  return {
    seedMean: seed.mean,
    seedVariance: seed.variance,
    syntheticMean: synth.mean,
    syntheticVariance: synth.variance,
    ratio,
    quality,
  };
}
