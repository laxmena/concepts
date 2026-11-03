// Small statistics helpers shared by the evaluation pages. Pure functions, no DOM.

/** Standard normal quantile (inverse CDF). Acklam's algorithm, relative error about 1e-9. */
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be between 0 and 1');
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Standard normal CDF. Uses the complementary error function (Numerical Recipes erfc, error under 1.2e-7). */
export function normalCdf(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * z);
  const erfc = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  const upper = 0.5 * erfc;
  return x >= 0 ? 1 - upper : upper;
}

/** Two-sided z for a confidence level, e.g. zTwoSided(0.95) is 1.96. */
export const zTwoSided = (level) => normalQuantile(1 - (1 - level) / 2);

/** Standard error of a mean of 0/1 scores. Miller (2024), equation 2. */
export const seBernoulli = (p, n) => Math.sqrt((p * (1 - p)) / n);

/** Wilson score interval for a proportion. Stays inside [0, 1] and has width at p = 0 or 1. */
export function wilson(p, n, z = 1.959963984540054) {
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

/** Small seeded random numbers so a demo gives the same result every time. mulberry32. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** C(c, k) / C(n, k) without big numbers: the chance that k draws without replacement all land in the c "good" items. */
export function chooseRatio(n, c, k) {
  if (k > c) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r *= (c - i) / (n - i);
  return r;
}
