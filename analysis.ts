/**
 * Statistics / time-series methods used by the scientific analysis engine.
 * Every function is deterministic and returns the metrics that are stored
 * alongside results so that findings are reproducible.
 */

export type Point = { period: string; value: number };

export function mean(values: number[]): number {
  if (!values.length) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sd(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function quantile(values: number[], q: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/** Lanczos log-gamma. */
function logGamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Continued fraction for the incomplete beta function (Numerical Recipes). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value of Student's t distribution. */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return NaN;
  return betai(df / 2, 0.5, df / (df + t * t));
}

export type OlsResult = {
  slope: number;
  intercept: number;
  r2: number;
  seSlope: number;
  tStat: number;
  pValue: number;
  n: number;
  residualSd: number;
};

export function ols(x: number[], y: number[]): OlsResult {
  const n = Math.min(x.length, y.length);
  if (n < 3) {
    return { slope: NaN, intercept: NaN, r2: NaN, seSlope: NaN, tStat: NaN, pValue: NaN, n, residualSd: NaN };
  }
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  if (sxx === 0) {
    return { slope: NaN, intercept: NaN, r2: NaN, seSlope: NaN, tStat: NaN, pValue: NaN, n, residualSd: NaN };
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i += 1) {
    const pred = intercept + slope * x[i];
    sse += (y[i] - pred) ** 2;
    sst += (y[i] - my) ** 2;
  }
  const df = n - 2;
  const mse = df > 0 ? sse / df : NaN;
  const seSlope = df > 0 ? Math.sqrt(mse / sxx) : NaN;
  const tStat = slope / seSlope;
  const r2 = sst > 0 ? 1 - sse / sst : NaN;
  return {
    slope,
    intercept,
    r2,
    seSlope,
    tStat,
    pValue: tTwoSidedP(tStat, df),
    n,
    residualSd: Math.sqrt(mse),
  };
}

/** Sen's slope (median of pairwise slopes), robust to outliers. */
export function senSlope(points: Point[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dt = j - i;
      slopes.push((points[j].value - points[i].value) / dt);
    }
  }
  return slopes.length ? quantile(slopes, 0.5) : NaN;
}

/** Mann–Kendall trend test with tie correction and normal approximation. */
export function mannKendall(values: number[]): { s: number; z: number; pValue: number; n: number; trend: string } {
  const n = values.length;
  let s = 0;
  for (let k = 0; k < n - 1; k += 1) {
    for (let j = k + 1; j < n; j += 1) {
      s += Math.sign(values[j] - values[k]);
    }
  }
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  let tieTerm = 0;
  counts.forEach((c) => {
    if (c > 1) tieTerm += c * (c - 1) * (2 * c + 5);
  });
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = variance > 0 ? (s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0) : NaN;
  const pValue = Number.isFinite(z) ? 2 * (1 - normalCdf(Math.abs(z))) : NaN;
  const trend = !Number.isFinite(z) ? "undetermined" : z > 1.96 ? "significant increase" : z < -1.96 ? "significant decrease" : "no significant monotonic trend";
  return { s, z, pValue, n, trend };
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function pearson(x: number[], y: number[]): { r: number; pValue: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, pValue: NaN, n };
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return { r: NaN, pValue: NaN, n };
  const r = sxy / Math.sqrt(sxx * syy);
  const df = n - 2;
  const t = r === 1 || r === -1 ? Infinity : r * Math.sqrt(df / (1 - r * r));
  return { r, pValue: tTwoSidedP(t, df), n };
}

export function welchT(x: number[], y: number[]): { t: number; df: number; pValue: number; diff: number } {
  const mx = mean(x);
  const my = mean(y);
  const vx = sd(x) ** 2 / x.length;
  const vy = sd(y) ** 2 / y.length;
  const t = (mx - my) / Math.sqrt(vx + vy);
  const df = (vx + vy) ** 2 / (vx ** 2 / (x.length - 1) + vy ** 2 / (y.length - 1));
  return { t, df, pValue: tTwoSidedP(t, df), diff: mx - my };
}

export type ValidationMetrics = {
  n: number;
  rmse: number;
  mae: number;
  bias: number;
  r: number;
  r2: number;
  pValue: number;
};

export function compareSeries(primary: Point[], reference: Point[]): ValidationMetrics {
  const refMap = new Map(reference.map((p) => [p.period, p.value]));
  const pairs = primary
    .filter((p) => refMap.has(p.period))
    .map((p) => [p.value, refMap.get(p.period) as number] as [number, number]);
  const n = pairs.length;
  if (n < 3) return { n, rmse: NaN, mae: NaN, bias: NaN, r: NaN, r2: NaN, pValue: NaN };
  let sse = 0;
  let sae = 0;
  let bias = 0;
  pairs.forEach(([a, b]) => {
    sse += (a - b) ** 2;
    sae += Math.abs(a - b);
    bias += a - b;
  });
  const corr = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  return {
    n,
    rmse: Math.sqrt(sse / n),
    mae: sae / n,
    bias: bias / n,
    r: corr.r,
    r2: corr.r * corr.r,
    pValue: corr.pValue,
  };
}

/* ------------------------------------------------------------------ */
/* Seasonal trend model: y = b0 + b1*t + harmonics + error             */
/* ------------------------------------------------------------------ */

export type ModelCoefficients = {
  beta: number[];
  residualSd: number;
  n: number;
  r2: number;
};

export type SeasonalModel = ModelCoefficients & {
  predict: (t: number) => number;
  horizonSd: number;
};

function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

function designRow(t: number): number[] {
  const monthAngle = (2 * Math.PI * (t % 12)) / 12;
  return [1, t, Math.sin(monthAngle), Math.cos(monthAngle), Math.sin(2 * monthAngle), Math.cos(2 * monthAngle)];
}

export function fitSeasonalModel(values: number[]): SeasonalModel | null {
  const n = values.length;
  if (n < 24) return null;
  const cols = 6;
  const ata = Array.from({ length: cols }, () => new Array(cols).fill(0));
  const aty = new Array(cols).fill(0);
  for (let i = 0; i < n; i += 1) {
    const row = designRow(i);
    for (let j = 0; j < cols; j += 1) {
      aty[j] += row[j] * values[i];
      for (let k = 0; k < cols; k += 1) ata[j][k] += row[j] * row[k];
    }
  }
  const beta = solveLinearSystem(ata, aty);
  if (!beta) return null;
  let sse = 0;
  let sst = 0;
  const ybar = mean(values);
  for (let i = 0; i < n; i += 1) {
    const row = designRow(i);
    const pred = row.reduce((sum, v, j) => sum + v * beta[j], 0);
    sse += (values[i] - pred) ** 2;
    sst += (values[i] - ybar) ** 2;
  }
  const residualSd = Math.sqrt(sse / Math.max(1, n - cols));
  return {
    beta,
    residualSd,
    n,
    r2: sst > 0 ? 1 - sse / sst : NaN,
    horizonSd: residualSd,
    predict: (t: number) => designRow(t).reduce((sum, v, j) => sum + v * beta[j], 0),
  };
}

/** Fit on the first part of the series and score the holdout window. */
export function holdoutValidation(values: number[], holdoutMonths: number) {
  const n = values.length;
  const holdout = Math.max(6, Math.min(holdoutMonths, Math.floor(n * 0.25)));
  const train = values.slice(0, n - holdout);
  const test = values.slice(n - holdout);
  const model = fitSeasonalModel(train);
  if (!model) return null;
  const actual = test;
  const predicted = test.map((_, i) => model.predict(train.length + i));
  let sse = 0;
  let sae = 0;
  let mapeSum = 0;
  let mapeCount = 0;
  for (let i = 0; i < actual.length; i += 1) {
    sse += (actual[i] - predicted[i]) ** 2;
    sae += Math.abs(actual[i] - predicted[i]);
    if (Math.abs(actual[i]) > 1e-6) {
      mapeSum += Math.abs((actual[i] - predicted[i]) / actual[i]);
      mapeCount += 1;
    }
  }
  const testMean = mean(actual);
  let sst = 0;
  actual.forEach((v) => {
    sst += (v - testMean) ** 2;
  });
  return {
    model,
    holdoutMonths: holdout,
    rmse: Math.sqrt(sse / actual.length),
    mae: sae / actual.length,
    mape: mapeCount ? (mapeSum / mapeCount) * 100 : null,
    r2: sst > 0 ? 1 - sse / sst : null,
    nTrain: train.length,
    nTest: actual.length,
  };
}

export function zScores(values: number[]): { mean: number; sd: number; z: number[] } {
  const m = mean(values);
  const s = sd(values);
  return { mean: m, sd: s, z: values.map((v) => (s > 0 ? (v - m) / s : 0)) };
}
