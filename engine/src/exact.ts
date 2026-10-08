// Exact algebraic-ish numbers: finite sums  Σ c · π^p · √r   (c rational, r square-free integer >= 1, p integer).
// π is treated as a transcendental symbol, radicals are kept square-free so the representation is canonical
// (two Ex are equal iff their term lists are identical).

import { D, type Dec } from './dec';
import { factorize, gcd, iroot, isqrt, squareFreeSplit } from './bigmath';
import { Q } from './rational';

export interface Term {
  readonly p: number;
  readonly r: bigint;
  readonly c: Q;
}
export type Ex = readonly Term[];

export const EX_ZERO: Ex = [];
export const EX_ONE: Ex = [{ p: 0, r: 1n, c: Q.ONE }];
export const EX_PI: Ex = [{ p: 1, r: 1n, c: Q.ONE }];

export const exQ = (q: Q): Ex => (q.isZero ? EX_ZERO : [{ p: 0, r: 1n, c: q }]);
export const exInt = (n: number | bigint): Ex => exQ(Q.of(n));

function normalize(terms: Term[]): Ex {
  terms.sort((a, b) => (a.p !== b.p ? a.p - b.p : a.r < b.r ? -1 : a.r > b.r ? 1 : 0));
  const out: Term[] = [];
  for (const t of terms) {
    const last = out[out.length - 1];
    if (last && last.p === t.p && last.r === t.r) {
      const c = last.c.add(t.c);
      if (c.isZero) out.pop();
      else out[out.length - 1] = { p: t.p, r: t.r, c };
    } else if (!t.c.isZero) out.push(t);
  }
  return out;
}

export const exIsZero = (a: Ex): boolean => a.length === 0;
export const exIsRational = (a: Ex): boolean => a.length === 0 || (a.length === 1 && a[0].p === 0 && a[0].r === 1n);
export function exToQ(a: Ex): Q | null {
  if (a.length === 0) return Q.ZERO;
  if (a.length === 1 && a[0].p === 0 && a[0].r === 1n) return a[0].c;
  return null;
}
/** If a == q·π return q, else null */
export function exPiMultiple(a: Ex): Q | null {
  if (a.length === 0) return Q.ZERO;
  if (a.length === 1 && a[0].p === 1 && a[0].r === 1n) return a[0].c;
  return null;
}

const isRat = (a: Ex): boolean => a.length === 1 && a[0].p === 0 && a[0].r === 1n;

export function exAdd(a: Ex, b: Ex): Ex {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  if (isRat(a) && isRat(b)) return exQ(a[0].c.add(b[0].c));
  return normalize([...a, ...b]);
}
export function exNeg(a: Ex): Ex {
  return a.map((t) => ({ p: t.p, r: t.r, c: t.c.neg() }));
}
export const exSub = (a: Ex, b: Ex): Ex => exAdd(a, exNeg(b));

export function exMulQ(a: Ex, q: Q): Ex {
  if (q.isZero) return EX_ZERO;
  if (q.eq(Q.ONE)) return a;
  return a.map((t) => ({ p: t.p, r: t.r, c: t.c.mul(q) }));
}

function mulTerm(a: Term, b: Term): Term {
  const g = gcd(a.r, b.r);
  const r = (a.r / g) * (b.r / g);
  return { p: a.p + b.p, r, c: a.c.mul(b.c).mul(Q.of(g)) };
}

export function exMul(a: Ex, b: Ex): Ex {
  if (a.length === 0 || b.length === 0) return EX_ZERO;
  if (isRat(a) && isRat(b)) return exQ(a[0].c.mul(b[0].c));
  if (a.length === 1 && b.length === 1) return [mulTerm(a[0], b[0])];
  const out: Term[] = [];
  for (const x of a) for (const y of b) out.push(mulTerm(x, y));
  return normalize(out);
}

/** Largest prime dividing any radicand, or null when all radicands are 1. */
function largestRadicalPrime(a: Ex): bigint | null {
  let best: bigint | null = null;
  for (const t of a) {
    if (t.r === 1n) continue;
    for (const [p] of factorize(t.r)) if (best === null || p > best) best = p;
  }
  return best;
}

/** Multiplicative inverse. Returns null when the inverse is not representable (e.g. 1/(1+π)). */
export function exInv(a: Ex): Ex | null {
  if (a.length === 0) return null;
  if (a.length === 1) {
    const t = a[0];
    // 1/(c π^p √r) = π^-p √r / (c r)
    return [{ p: -t.p, r: t.r, c: t.c.inv().div(Q.of(t.r)) }];
  }
  if (a.some((t) => t.p !== 0)) return null;
  const q = largestRadicalPrime(a);
  if (q === null) return null; // cannot happen: >1 terms with p=0 means some r>1
  // D = A + B√q, with A, B free of √q
  const A: Term[] = [];
  const B: Term[] = [];
  for (const t of a) {
    if (t.r % q === 0n) B.push({ p: 0, r: t.r / q, c: t.c });
    else A.push(t);
  }
  const Aex = normalize(A);
  const Bex = normalize(B);
  // conj = A - B√q ;  D·conj = A² − q B²
  const sqrtQ: Ex = [{ p: 0, r: q, c: Q.ONE }];
  const conj = exSub(Aex, exMul(Bex, sqrtQ));
  const norm = exSub(exMul(Aex, Aex), exMulQ(exMul(Bex, Bex), Q.of(q)));
  const ninv = exInv(norm);
  if (ninv === null) return null;
  return exMul(conj, ninv);
}

export function exDiv(a: Ex, b: Ex): Ex | null {
  const i = exInv(b);
  return i === null ? null : exMul(a, i);
}

/** integer power, e may be negative. Returns null if inverse is not representable. */
export function exPowInt(a: Ex, e: number): Ex | null {
  if (e === 0) return EX_ONE;
  if (e < 0) {
    const i = exInv(a);
    return i === null ? null : exPowInt(i, -e);
  }
  let result: Ex = EX_ONE;
  let base = a;
  let n = e;
  while (n > 0) {
    if (n & 1) result = exMul(result, base);
    n >>= 1;
    if (n > 0) base = exMul(base, base);
  }
  return result;
}

/** √ of a non-negative rational as an Ex: √(n/d) = s√r / d' */
export function sqrtQ(q: Q): Ex {
  if (q.isZero) return EX_ZERO;
  // √(n/d) = √(n·d)/d
  const { s, r } = squareFreeSplit(q.n * q.d);
  return [{ p: 0, r, c: Q.of(s, q.d) }];
}

/** Exact square root of a non-negative Ex, or null if not representable. */
export function exSqrt(a: Ex): Ex | null {
  if (a.length === 0) return EX_ZERO;
  const q = exToQ(a);
  if (q) return q.sign >= 0 ? sqrtQ(q) : null;
  if (a.length === 1) {
    const t = a[0];
    if (t.r !== 1n || t.p % 2 !== 0 || t.c.sign < 0) return null;
    const inner = sqrtQ(t.c);
    return exMul(inner, [{ p: t.p / 2, r: 1n, c: Q.ONE }]);
  }
  // denesting  √(a + b√r) = √x + √y   (x + y = a, 4xy = b² r)
  if (a.length === 2 && a.every((t) => t.p === 0) && a[0].r === 1n) {
    const aa = a[0].c;
    const bb = a[1].c;
    const r = a[1].r;
    // x,y roots of z² − a z + b² r / 4 = 0
    const disc = aa.mul(aa).sub(bb.mul(bb).mul(Q.of(r)));
    if (disc.sign >= 0) {
      const sd = exToQ(sqrtQ(disc));
      if (sd) {
        const two = Q.of(2);
        const x = aa.add(sd).div(two);
        const y = aa.sub(sd).div(two);
        if (x.sign >= 0 && y.sign >= 0) {
          const sx = sqrtQ(x);
          const sy = sqrtQ(y);
          // sign of b decides √x ± √y; result must be positive
          const cand = bb.sign >= 0 ? exAdd(sx, sy) : exSub(sx, sy);
          const sq = exMul(cand, cand);
          if (exSub(sq, a).length === 0 && exSign(cand) > 0) return cand;
          const cand2 = exNeg(cand);
          if (exSign(cand2) > 0 && exSub(exMul(cand2, cand2), a).length === 0) return cand2;
        }
      }
    }
  }
  return null;
}

/** Exact integer-root of a rational: returns q^(1/k) if rational, else null (q >= 0). */
export function qRoot(q: Q, k: number): Q | null {
  if (q.sign < 0) return null;
  const n = iroot(q.n, k);
  const d = iroot(q.d, k);
  if (n ** BigInt(k) === q.n && d ** BigInt(k) === q.d) return Q.of(n, d);
  return null;
}

export function exToDecimal(a: Ex): Dec {
  let sum = new D(0);
  for (const t of a) {
    let v = t.c.toDecimal();
    if (t.p !== 0) v = v.mul(D.acos(-1).pow(t.p));
    if (t.r !== 1n) v = v.mul(new D(t.r.toString()).sqrt());
    sum = sum.add(v);
  }
  return sum;
}

export function exSign(a: Ex): -1 | 0 | 1 {
  if (a.length === 0) return 0;
  if (a.length === 1) return a[0].c.sign;
  const v = exToDecimal(a);
  return v.isZero() ? 0 : v.isNeg() ? -1 : 1;
}

export const exCmp = (a: Ex, b: Ex): -1 | 0 | 1 => exSign(exSub(a, b));

/** integer sqrt helper re-export for callers */
export { isqrt };
