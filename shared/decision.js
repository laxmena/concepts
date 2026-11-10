// Maths shared by the decision-model pages (calibration, confidence routing). Pure: no DOM.
// A toy binary decision. The model has a raw score z (a log-odds number); positive means "yes".
// A model with temperature T reports P(yes) = sigmoid(z / T). Reality is also a sigmoid, with its own temperature `trueT`:
// the chance that the model's call is right is sigmoid(|z| / trueT). The model is calibrated exactly when T equals trueT.
// T below trueT means overconfident, above means underconfident. The examples are evenly spaced quantiles of a normal(0, spread), so nothing is random.

import { normalQuantile } from './stats.js';

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const examples = (n, spread = 2) => Array.from({ length: n }, (_, i) => normalQuantile((i + 0.5) / n) * spread);
/** The confidence the model reports in its own call: the larger of P(yes) and P(no). */
export const confidence = (z, T) => { const p = sigmoid(z / T); return Math.max(p, 1 - p); };
/** The real chance that the model's call is right. */
export const chanceRight = (z, trueT) => sigmoid(Math.abs(z) / trueT);

/** Group examples by reported confidence into equal-width bins over [0.5, 1]. */
export function reliability(zs, T, trueT, bins = 10) {
  const out = Array.from({ length: bins }, (_, b) => ({ lo: 0.5 + (0.5 * b) / bins, hi: 0.5 + (0.5 * (b + 1)) / bins, count: 0, conf: 0, acc: 0 }));
  for (const z of zs) {
    const c = confidence(z, T), b = Math.min(bins - 1, Math.floor(((c - 0.5) / 0.5) * bins));
    out[b].count++; out[b].conf += c; out[b].acc += chanceRight(z, trueT);
  }
  for (const o of out) if (o.count) { o.conf /= o.count; o.acc /= o.count; }
  return out;
}
/** Expected calibration error: the count-weighted gap between what the model says and how often it is right. */
export const ece = (bins) => { const N = bins.reduce((s, b) => s + b.count, 0); return bins.reduce((s, b) => s + (b.count / N) * Math.abs(b.acc - b.conf), 0); };

/** Send every decision the model is at least `threshold` sure of to the cheap model, the rest to the strong one. */
export function route(zs, T, trueT, threshold, strongAccuracy, cheapCost, strongCost) {
  let handled = 0, right = 0, said = 0;
  for (const z of zs) { const c = confidence(z, T); if (c >= threshold) { handled++; right += chanceRight(z, trueT); said += c; } }
  const n = zs.length, rest = n - handled;
  const accuracy = (right + rest * strongAccuracy) / n;
  return { share: handled / n, cheapAccuracy: handled ? right / handled : null, saidAccuracy: handled ? said / handled : null, accuracy, cost: (n * cheapCost + rest * strongCost) / (n * strongCost) };
}
