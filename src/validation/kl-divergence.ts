/**
 * KL-Divergence (Kullback-Leibler divergence).
 * Measures information-theoretic distance between two distributions.
 * KL(P||Q) = sum(P(x) * log(P(x)/Q(x)))
 *
 * Lower is better. KL=0 means identical distributions.
 * Typical thresholds: <0.05 excellent, <0.1 good, <0.2 acceptable.
 */

export interface KLResult {
  divergence: number;
  quality: 'excellent' | 'good' | 'acceptable' | 'poor';
  labels: string[];
  pDistribution: number[];
  qDistribution: number[];
}

/**
 * Compute KL divergence from P (seed) to Q (synthetic).
 * Uses Laplace smoothing to handle zero counts.
 */
export function klDivergence(
  seedCounts: number[],
  syntheticCounts: number[],
  labels?: string[]
): KLResult {
  if (seedCounts.length !== syntheticCounts.length) {
    throw new Error('Arrays must have the same length');
  }

  const k = seedCounts.length;
  const epsilon = 1; // Laplace smoothing (add-1)

  // Normalize to distributions with smoothing
  const seedTotal = seedCounts.reduce((a, b) => a + b, 0) + k * epsilon;
  const synthTotal = syntheticCounts.reduce((a, b) => a + b, 0) + k * epsilon;

  const p = seedCounts.map(c => (c + epsilon) / seedTotal);
  const q = syntheticCounts.map(c => (c + epsilon) / synthTotal);

  let divergence = 0;
  for (let i = 0; i < k; i++) {
    if (p[i] > 0) {
      divergence += p[i] * Math.log(p[i] / q[i]);
    }
  }

  let quality: KLResult['quality'];
  if (divergence < 0.05) quality = 'excellent';
  else if (divergence < 0.1) quality = 'good';
  else if (divergence < 0.2) quality = 'acceptable';
  else quality = 'poor';

  return {
    divergence,
    quality,
    labels: labels || seedCounts.map((_, i) => `Category ${i + 1}`),
    pDistribution: p,
    qDistribution: q,
  };
}

/**
 * Jensen-Shannon Divergence (symmetric version of KL).
 * JSD = 0.5 * KL(P||M) + 0.5 * KL(Q||M) where M = 0.5*(P+Q)
 * Range [0, ln(2)] ≈ [0, 0.693]
 */
export function jsDivergence(
  seedCounts: number[],
  syntheticCounts: number[]
): number {
  const k = seedCounts.length;
  const epsilon = 1;

  const seedTotal = seedCounts.reduce((a, b) => a + b, 0) + k * epsilon;
  const synthTotal = syntheticCounts.reduce((a, b) => a + b, 0) + k * epsilon;

  const p = seedCounts.map(c => (c + epsilon) / seedTotal);
  const q = syntheticCounts.map(c => (c + epsilon) / synthTotal);
  const m = p.map((pi, i) => 0.5 * (pi + q[i]));

  let klPM = 0, klQM = 0;
  for (let i = 0; i < k; i++) {
    if (p[i] > 0) klPM += p[i] * Math.log(p[i] / m[i]);
    if (q[i] > 0) klQM += q[i] * Math.log(q[i] / m[i]);
  }

  return 0.5 * klPM + 0.5 * klQM;
}
