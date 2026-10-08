// Statistics: one-variable statistics and regression (linear, quadratic, ln, e^, a·b^, a·x^b, 1/x).
// Exact rational / radical arithmetic is used whenever the data allows it.

import { mathError } from './errors';
import * as F from './mathfn';
import * as N from './num';
import type { Num } from './num';
import { solveLinear } from './poly';

export type StatType = '1var' | 'lin' | 'quad' | 'ln' | 'exp' | 'ab' | 'pow' | 'inv';

export interface StatRow {
  x: Num;
  y?: Num;
  f: Num;
}

export const STAT_TYPES: { id: StatType; label: string }[] = [
  { id: '1var', label: '1-VAR' },
  { id: 'lin', label: 'A+BX' },
  { id: 'quad', label: '_+CX²' },
  { id: 'ln', label: 'ln X' },
  { id: 'exp', label: 'e^X' },
  { id: 'ab', label: 'A·B^X' },
  { id: 'pow', label: 'A·X^B' },
  { id: 'inv', label: '1/X' },
];

export const isTwoVar = (t: StatType): boolean => t !== '1var';

const sum = (xs: Num[]): Num => xs.reduce((a, b) => N.add(a, b), N.ZERO);

/** transformed coordinates used for sums and regression */
function transform(type: StatType, x: Num, y: Num | undefined): [Num, Num | undefined] {
  const ty = (v: Num | undefined) => (v === undefined ? undefined : F.ln(v));
  switch (type) {
    case 'ln':
      return [F.ln(x), y];
    case 'exp':
    case 'ab':
      return [x, ty(y)];
    case 'pow':
      return [F.ln(x), ty(y)];
    case 'inv':
      return [N.div(N.ONE, x), y];
    default:
      return [x, y];
  }
}

export interface Stats {
  type: StatType;
  n: Num;
  sumX: Num;
  sumX2: Num;
  sumX3: Num;
  sumX4: Num;
  sumY: Num;
  sumY2: Num;
  sumXY: Num;
  sumX2Y: Num;
  meanX: Num;
  meanY: Num;
  sigmaX: () => Num;
  sx: () => Num;
  sigmaY: () => Num;
  sy: () => Num;
  minX: () => Num;
  maxX: () => Num;
  minY: () => Num;
  maxY: () => Num;
  Q1: () => Num;
  Med: () => Num;
  Q3: () => Num;
  /** regression coefficients (two-variable types) */
  A: () => Num;
  B: () => Num;
  C: () => Num;
  r: () => Num;
  yhat: (x: Num) => Num;
  xhat: (y: Num, which?: 1 | 2) => Num;
}

function median(sorted: Num[]): Num {
  const n = sorted.length;
  if (n === 0) throw mathError();
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return N.div(N.add(sorted[n / 2 - 1], sorted[n / 2]), N.fromInt(2));
}

export function computeStats(type: StatType, rows: StatRow[]): Stats {
  const two = isTwoVar(type);
  // transformed values with weights
  const pts = rows.map((r) => {
    const [x, y] = transform(type, r.x, r.y);
    return { x, y, f: r.f, ox: r.x, oy: r.y };
  });
  const f = pts.map((p) => p.f);
  const wsum = (g: (p: (typeof pts)[number]) => Num) => sum(pts.map((p) => N.mul(p.f, g(p))));
  const n = sum(f);
  const sumX = wsum((p) => p.x);
  const sumX2 = wsum((p) => N.mul(p.x, p.x));
  const sumX3 = wsum((p) => N.mul(p.x, N.mul(p.x, p.x)));
  const sumX4 = wsum((p) => N.mul(N.mul(p.x, p.x), N.mul(p.x, p.x)));
  const Y = (p: (typeof pts)[number]): Num => p.y ?? N.ZERO;
  const sumY = two ? wsum(Y) : N.ZERO;
  const sumY2 = two ? wsum((p) => N.mul(Y(p), Y(p))) : N.ZERO;
  const sumXY = two ? wsum((p) => N.mul(p.x, Y(p))) : N.ZERO;
  const sumX2Y = two ? wsum((p) => N.mul(N.mul(p.x, p.x), Y(p))) : N.ZERO;

  const needN = (): void => {
    if (N.isZero(n)) throw mathError();
  };
  const meanX = N.isZero(n) ? N.ZERO : N.div(sumX, n);
  const meanY = N.isZero(n) ? N.ZERO : N.div(sumY, n);
  const varianceP = (s2: Num, s1: Num): Num => {
    needN();
    // population variance = Σx²/n − (Σx/n)²
    const m = N.div(s1, n);
    return N.sub(N.div(s2, n), N.mul(m, m));
  };
  const sigma = (s2: Num, s1: Num): Num => N.sqrt(clampZero(varianceP(s2, s1)));
  const sampleSd = (s2: Num, s1: Num): Num => {
    if (N.cmp(n, N.ONE) <= 0) throw mathError();
    const m = N.div(s1, n);
    return N.sqrt(clampZero(N.div(N.sub(s2, N.mul(n, N.mul(m, m))), N.sub(n, N.ONE))));
  };

  // order statistics on the ORIGINAL x / y
  const sortedOf = (get: (p: (typeof pts)[number]) => Num | undefined): Num[] => {
    const arr: Num[] = [];
    for (const p of pts) {
      const v = get(p);
      const cnt = N.toBigInt(p.f);
      if (v === undefined || cnt === null || cnt < 0n || cnt > 5000n) continue;
      for (let i = 0n; i < cnt; i++) arr.push(v);
    }
    return arr.sort((a, b) => N.cmp(a, b));
  };
  const sortedX = () => sortedOf((p) => p.ox);
  const quart = (which: 1 | 3): Num => {
    const s = sortedX();
    const m = s.length;
    if (m < 2) throw mathError();
    const half = Math.floor(m / 2);
    const part = which === 1 ? s.slice(0, half) : s.slice(m - half);
    return median(part);
  };
  const minMax = (get: (p: (typeof pts)[number]) => Num | undefined, isMax: boolean): Num => {
    const vals = pts.map(get).filter((v): v is Num => v !== undefined);
    if (vals.length === 0) throw mathError();
    return N.minMax(vals, isMax);
  };

  // ------------------------------------------------------------ regression
  const linAB = (): [Num, Num] => {
    needN();
    const den = N.sub(N.mul(n, sumX2), N.mul(sumX, sumX));
    if (N.isZero(den)) throw mathError();
    const b = N.div(N.sub(N.mul(n, sumXY), N.mul(sumX, sumY)), den);
    const a = N.div(N.sub(sumY, N.mul(b, sumX)), n);
    return [a, b];
  };
  const quadABC = (): [Num, Num, Num] => {
    needN();
    // normal equations:  nA + Σx B + Σx² C = Σy ; Σx A + Σx² B + Σx³ C = Σxy ; Σx² A + Σx³ B + Σx⁴ C = Σx²y
    const sol = solveLinear([
      [n, sumX, sumX2, sumY],
      [sumX, sumX2, sumX3, sumXY],
      [sumX2, sumX3, sumX4, sumX2Y],
    ]);
    return [sol[0], sol[1], sol[2]];
  };
  const coeffs = (): { A: Num; B: Num; C: Num } => {
    if (type === 'quad') {
      const [a, b, c] = quadABC();
      return { A: a, B: b, C: c };
    }
    const [a, b] = linAB();
    switch (type) {
      case 'exp':
        return { A: F.exp(a), B: b, C: N.ZERO };
      case 'ab':
        return { A: F.exp(a), B: F.exp(b), C: N.ZERO };
      case 'pow':
        return { A: F.exp(a), B: b, C: N.ZERO };
      default:
        return { A: a, B: b, C: N.ZERO };
    }
  };
  const corr = (): Num => {
    if (type === 'quad') throw mathError();
    needN();
    const num = N.sub(N.mul(n, sumXY), N.mul(sumX, sumY));
    const dx = N.sub(N.mul(n, sumX2), N.mul(sumX, sumX));
    const dy = N.sub(N.mul(n, sumY2), N.mul(sumY, sumY));
    const den = N.sqrt(N.mul(clampZero(dx), clampZero(dy)));
    if (N.isZero(den)) throw mathError();
    return N.div(num, den);
  };
  const yhat = (x: Num): Num => {
    const { A, B, C: c } = coeffs();
    switch (type) {
      case 'lin':
        return N.add(A, N.mul(B, x));
      case 'quad':
        return N.add(N.add(A, N.mul(B, x)), N.mul(c, N.mul(x, x)));
      case 'ln':
        return N.add(A, N.mul(B, F.ln(x)));
      case 'exp':
        return N.mul(A, F.exp(N.mul(B, x)));
      case 'ab':
        return N.mul(A, N.pow(B, x));
      case 'pow':
        return N.mul(A, N.pow(x, B));
      case 'inv':
        return N.add(A, N.div(B, x));
      default:
        throw mathError();
    }
  };
  const xhat = (y: Num, which: 1 | 2 = 1): Num => {
    const { A, B, C: c } = coeffs();
    switch (type) {
      case 'lin':
        return N.div(N.sub(y, A), B);
      case 'quad': {
        const d = N.sub(N.mul(B, B), N.mul(N.fromInt(4), N.mul(c, N.sub(A, y))));
        if (N.sign(d) < 0 || N.isZero(c)) throw mathError();
        const s = N.sqrt(d);
        const two = N.mul(N.fromInt(2), c);
        return which === 1 ? N.div(N.add(N.neg(B), s), two) : N.div(N.sub(N.neg(B), s), two);
      }
      case 'ln':
        return F.exp(N.div(N.sub(y, A), B));
      case 'exp':
        return N.div(F.ln(N.div(y, A)), B);
      case 'ab':
        return N.div(F.ln(N.div(y, A)), F.ln(B));
      case 'pow':
        return N.pow(N.div(y, A), N.div(N.ONE, B));
      case 'inv':
        return N.div(B, N.sub(y, A));
      default:
        throw mathError();
    }
  };

  return {
    type,
    n,
    sumX,
    sumX2,
    sumX3,
    sumX4,
    sumY,
    sumY2,
    sumXY,
    sumX2Y,
    meanX,
    meanY,
    sigmaX: () => sigma(sumX2, sumX),
    sx: () => sampleSd(sumX2, sumX),
    sigmaY: () => sigma(sumY2, sumY),
    sy: () => sampleSd(sumY2, sumY),
    minX: () => minMax((p) => p.ox, false),
    maxX: () => minMax((p) => p.ox, true),
    minY: () => minMax((p) => p.oy, false),
    maxY: () => minMax((p) => p.oy, true),
    Q1: () => quart(1),
    Med: () => median(sortedX()),
    Q3: () => quart(3),
    A: () => coeffs().A,
    B: () => coeffs().B,
    C: () => coeffs().C,
    r: corr,
    yhat,
    xhat,
  };
}

/** tiny negative values from rounding of approximate data are clamped to zero before sqrt */
function clampZero(x: Num): Num {
  return N.sign(x) < 0 && x.t === 'a' ? N.ZERO : x;
}

