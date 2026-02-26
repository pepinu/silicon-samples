/**
 * Chi-squared goodness-of-fit test.
 * Tests whether synthetic response distribution matches seed data distribution.
 * p-value > 0.05 means we cannot reject the null hypothesis that distributions are the same.
 */

export interface ChiSquaredResult {
  statistic: number;
  degreesOfFreedom: number;
  pValue: number;
  observed: number[];
  expected: number[];
  labels: string[];
}

export function chiSquaredTest(observed: number[], expected: number[], labels?: string[]): ChiSquaredResult {
  if (observed.length !== expected.length) {
    throw new Error('Observed and expected arrays must have the same length');
  }

  const k = observed.length;
  if (k < 2) throw new Error('Need at least 2 categories');

  // Scale expected to match observed total
  const obsTotal = observed.reduce((a, b) => a + b, 0);
  const expTotal = expected.reduce((a, b) => a + b, 0);
  const scaledExpected = expected.map(e => (e / expTotal) * obsTotal);

  let statistic = 0;
  for (let i = 0; i < k; i++) {
    if (scaledExpected[i] > 0) {
      statistic += Math.pow(observed[i] - scaledExpected[i], 2) / scaledExpected[i];
    }
  }

  const df = k - 1;
  const pValue = 1 - chiSquaredCDF(statistic, df);

  return {
    statistic,
    degreesOfFreedom: df,
    pValue,
    observed,
    expected: scaledExpected,
    labels: labels || observed.map((_, i) => `Category ${i + 1}`),
  };
}

/**
 * Chi-squared CDF approximation using the regularized incomplete gamma function.
 * Sufficient accuracy for our validation purposes.
 */
function chiSquaredCDF(x: number, k: number): number {
  if (x <= 0) return 0;
  return regularizedGammaP(k / 2, x / 2);
}

function regularizedGammaP(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;

  // Use series expansion for x < a + 1
  if (x < a + 1) {
    return gammaPSeries(a, x);
  }
  // Use continued fraction for x >= a + 1
  return 1 - gammaPContinuedFraction(a, x);
}

function gammaPSeries(a: number, x: number): number {
  const lnGammaA = lnGamma(a);
  let sum = 1 / a;
  let term = 1 / a;

  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-10) break;
  }

  return sum * Math.exp(-x + a * Math.log(x) - lnGammaA);
}

function gammaPContinuedFraction(a: number, x: number): number {
  const lnGammaA = lnGamma(a);
  let f = 1e-30;
  let c = 1e-30;
  let d = 0;

  for (let i = 1; i < 200; i++) {
    const an = i % 2 === 1
      ? ((i + 1) / 2 - a) // odd terms
      : i / 2;             // even terms
    const bn = i % 2 === 1 ? 1 : x;

    if (i === 1) {
      d = x + 1 - a;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = x + 1 - a + an / c;
      d = 1 / d;
      f = c * d;
    } else {
      d = bn + an * d;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = bn + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      f *= c * d;
    }
  }

  // Simpler Lentz continued fraction
  let b = x + 1 - a;
  let cc = 1 / 1e-30;
  let dd = 1 / b;
  let h = dd;

  for (let i = 1; i <= 200; i++) {
    const aaN = -i * (i - a);
    b += 2;
    dd = aaN * dd + b;
    if (Math.abs(dd) < 1e-30) dd = 1e-30;
    cc = b + aaN / cc;
    if (Math.abs(cc) < 1e-30) cc = 1e-30;
    dd = 1 / dd;
    const del = dd * cc;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x) - lnGammaA) * h;
}

function lnGamma(x: number): number {
  // Stirling's approximation with Lanczos coefficients
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += c[j] / ++y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
