// Probability distributions (normal, binomial, Poisson) in high-precision decimal arithmetic.

import Decimal from 'decimal.js';
import { D, type Dec } from './dec';
import { mathError } from './errors';

/** extra-precision working context (erf series needs headroom for the tails) */
const W = Decimal.clone({ precision: 100, rounding: Decimal.ROUND_HALF_EVEN, minE: -100000, maxE: 100000 });
type W = InstanceType<typeof W>;
const w = (x: Dec | number | string): W => new W(x.toString());

const PI = W.acos(-1);
const SQRT2 = new W(2).sqrt();
const SQRT_2PI = PI.mul(2).sqrt();

/** erf(x) via the positive-term series  2/√π e^{-x²} Σ 2^n x^{2n+1}/(2n+1)!!  */
function erfW(x: W): W {
  if (x.isZero()) return new W(0);
  const neg = x.isNeg();
  const ax = x.abs();
  if (ax.gt(40)) return new W(neg ? -1 : 1);
  const x2 = ax.mul(ax);
  let term = ax; // n = 0
  let sum = term;
  for (let n = 1; n < 5000; n++) {
    term = term.mul(x2.mul(2)).div(2 * n + 1);
    sum = sum.add(term);
    if (term.lt(sum.mul(new W('1e-95')))) break;
  }
  const r = sum.mul(x2.neg().exp()).mul(2).div(PI.sqrt());
  return neg ? r.neg() : r;
}

/** standard normal CDF Φ(z) */
function phiW(z: W): W {
  if (z.lt(-40)) return new W(0);
  if (z.gt(40)) return new W(1);
  // for the lower tail use 1/2 erfc to keep relative accuracy: Φ(z) = (1 + erf(z/√2)) / 2, 100 digits are plenty
  return new W(1).add(erfW(z.div(SQRT2))).div(2);
}

function check(cond: boolean): void {
  if (!cond) throw mathError();
}

export function normalPdf(x: Dec, mu: Dec, sigma: Dec): Dec {
  check(sigma.gt(0));
  const z = w(x).sub(w(mu)).div(w(sigma));
  const v = z.mul(z).div(2).neg().exp().div(SQRT_2PI.mul(w(sigma)));
  return new D(v.toString());
}

/** P(lower ≤ X ≤ upper) for X ~ N(mu, sigma²) */
export function normalCdf(lower: Dec, upper: Dec, mu: Dec, sigma: Dec): { p: Dec; zlow: Dec; zup: Dec } {
  check(sigma.gt(0));
  const zl = w(lower).sub(w(mu)).div(w(sigma));
  const zu = w(upper).sub(w(mu)).div(w(sigma));
  const p = phiW(zu).sub(phiW(zl));
  return { p: new D(p.toString()), zlow: new D(zl.toString()), zup: new D(zu.toString()) };
}

/** inverse standard normal: x such that Φ(x) = p, 0 < p < 1 */
function invPhi(p: W): W {
  check(p.gt(0) && p.lt(1));
  // Acklam's rational approximation as a starting point, then Newton steps in high precision
  const pd = Number(p.toString());
  let x0: number;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (pd < pl) {
    const q = Math.sqrt(-2 * Math.log(pd));
    x0 = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (pd <= 1 - pl) {
    const q = pd - 0.5;
    const r = q * q;
    x0 = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - pd));
    x0 = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  let x = new W(x0);
  for (let i = 0; i < 6; i++) {
    const err = phiW(x).sub(p);
    const pdf = x.mul(x).div(2).neg().exp().div(SQRT_2PI);
    if (pdf.isZero()) break;
    const nx = x.sub(err.div(pdf));
    if (nx.sub(x).abs().lt(new W('1e-60'))) {
      x = nx;
      break;
    }
    x = nx;
  }
  return x;
}

export type Tail = 'left' | 'right' | 'central';

export function inverseNormal(area: Dec, mu: Dec, sigma: Dec, tail: Tail = 'left'): Dec[] {
  check(sigma.gt(0) && area.gt(0) && area.lt(1));
  const a = w(area);
  const s = w(sigma);
  const m = w(mu);
  const mk = (z: W) => new D(m.add(z.mul(s)).toString());
  switch (tail) {
    case 'left':
      return [mk(invPhi(a))];
    case 'right':
      return [mk(invPhi(new W(1).sub(a)))];
    default: {
      // central: area between mu - k and mu + k
      const hi = invPhi(new W(1).add(a).div(2));
      return [mk(hi.neg()), mk(hi)];
    }
  }
}

// ---------------------------------------------------------------- binomial

function lnFact(n: number): W {
  if (n < 2) return new W(0);
  if (n < 60) {
    let f = new W(1);
    for (let i = 2; i <= n; i++) f = f.mul(i);
    return f.ln();
  }
  // Stirling series
  const x = new W(n);
  let s = x.mul(x.ln()).sub(x).add(PI.mul(2).mul(x).ln().div(2));
  const x2 = x.mul(x);
  let pw = x;
  const B = ['1/12', '-1/360', '1/1260', '-1/1680', '1/1188', '-691/360360', '1/156', '-3617/122400'];
  for (const frac of B) {
    const [nu, de] = frac.split('/');
    s = s.add(new W(nu).div(de).div(pw));
    pw = pw.mul(x2);
  }
  return s;
}

function binomPmfW(x: number, n: number, p: W): W {
  if (p.isZero()) return new W(x === 0 ? 1 : 0);
  if (p.eq(1)) return new W(x === n ? 1 : 0);
  const lnC = lnFact(n).sub(lnFact(x)).sub(lnFact(n - x));
  return lnC.add(p.ln().mul(x)).add(new W(1).sub(p).ln().mul(n - x)).exp();
}

function toInt(x: Dec, max = 1e9): number {
  check(x.isInteger() && x.gte(0) && x.lte(max));
  return x.toNumber();
}

function binomParams(n: Dec, p: Dec): { n: number; p: W } {
  check(p.gte(0) && p.lte(1));
  return { n: toInt(n, 1e7), p: w(p) };
}

export function binomialPd(x: Dec, n: Dec, p: Dec): Dec {
  const { n: N0, p: pw } = binomParams(n, p);
  const k = toInt(x, N0);
  return new D(binomPmfW(k, N0, pw).toString());
}

export function binomialCdf(x: Dec, n: Dec, p: Dec): Dec {
  const { n: N0, p: pw } = binomParams(n, p);
  const xi = x.floor();
  check(xi.gte(0));
  const k = Math.min(xi.toNumber(), N0);
  // recurrence from pmf(0) with ratio (n-k)/(k+1) * p/(1-p)
  if (pw.isZero()) return new D(1);
  if (pw.eq(1)) return new D(k >= N0 ? 1 : 0);
  let pmf = binomPmfW(0, N0, pw);
  let sum = pmf;
  const r = pw.div(new W(1).sub(pw));
  for (let i = 0; i < k; i++) {
    pmf = pmf.mul(r).mul(N0 - i).div(i + 1);
    sum = sum.add(pmf);
  }
  return new D(Decimal.min(sum, new W(1)).toString());
}

/** smallest x with P(X ≤ x) ≥ area */
export function inverseBinomial(area: Dec, n: Dec, p: Dec): Dec {
  const { n: N0, p: pw } = binomParams(n, p);
  check(area.gt(0) && area.lt(1));
  const a = w(area);
  if (pw.isZero()) return new D(0);
  let pmf = binomPmfW(0, N0, pw);
  let sum = pmf;
  const r = pw.eq(1) ? new W(0) : pw.div(new W(1).sub(pw));
  for (let i = 0; i <= N0; i++) {
    if (sum.gte(a.sub(new W('1e-90')))) return new D(i);
    pmf = pmf.mul(r).mul(N0 - i).div(i + 1);
    sum = sum.add(pmf);
  }
  return new D(N0);
}

// ---------------------------------------------------------------- Poisson

function poissonPmfW(k: number, mu: W): W {
  return mu.neg().add(mu.ln().mul(k)).sub(lnFact(k)).exp();
}

export function poissonPd(x: Dec, mu: Dec): Dec {
  check(mu.gt(0));
  const k = toInt(x);
  return new D(poissonPmfW(k, w(mu)).toString());
}

export function poissonCdf(x: Dec, mu: Dec): Dec {
  check(mu.gt(0));
  const xi = x.floor();
  check(xi.gte(0) && xi.lte(1e7));
  const k = xi.toNumber();
  const m = w(mu);
  let pmf = m.neg().exp();
  let sum = pmf;
  for (let i = 1; i <= k; i++) {
    pmf = pmf.mul(m).div(i);
    sum = sum.add(pmf);
  }
  return new D(Decimal.min(sum, new W(1)).toString());
}

export function inversePoisson(area: Dec, mu: Dec): Dec {
  check(mu.gt(0) && area.gt(0) && area.lt(1));
  const a = w(area);
  const m = w(mu);
  let pmf = m.neg().exp();
  let sum = pmf;
  for (let i = 0; i < 10_000_000; i++) {
    if (sum.gte(a.sub(new W('1e-90')))) return new D(i);
    pmf = pmf.mul(m).div(i + 1);
    sum = sum.add(pmf);
  }
  throw mathError();
}

/** standard normal Φ(t) (area from -∞ to t), used by P( Q( R( in the STAT calculation screen */
export const stdPhi = (t: Dec): Dec => new D(phiW(w(t)).toString());
/** Q(t): area between 0 and t */
export const stdQ = (t: Dec): Dec => new D(phiW(w(t)).sub(new W('0.5')).toString());
/** R(t): area from t to +∞ */
export const stdR = (t: Dec): Dec => new D(new W(1).sub(phiW(w(t))).toString());
