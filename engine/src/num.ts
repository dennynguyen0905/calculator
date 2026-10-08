// The calculator's real number type.
//   'x' = exact value (Ex) plus a "decimal display" flag d (set when a decimal was typed or an irrational
//         function result forced decimals; S⇔D flips how the same exact value is shown)
//   'a' = approximation, always kept rounded to 15 significant digits

import { D, round15, type Dec } from './dec';
import { bitLength } from './bigmath';
import { mathError } from './errors';
import {
  EX_ONE,
  EX_PI,
  EX_ZERO,
  exAdd,
  exCmp,
  exDiv,
  exInt,
  exIsZero,
  exMul,
  exNeg,
  exPowInt,
  exQ,
  exSign,
  exSqrt,
  exSub,
  exToDecimal,
  exToQ,
  qRoot,
  type Ex,
} from './exact';
import { Q } from './rational';

export interface XNum {
  readonly t: 'x';
  readonly v: Ex;
  readonly d: boolean;
}
export interface ANum {
  readonly t: 'a';
  readonly v: Dec;
}
export type Num = XNum | ANum;

const MAX_TERMS = 8;
const MAX_BITS = 3000;
const MAX_PI = 2;
const OVERFLOW = new D('1e100');
const UNDERFLOW = new D('1e-99');

export const ZERO: Num = { t: 'x', v: EX_ZERO, d: false };
export const ONE: Num = { t: 'x', v: EX_ONE, d: false };
export const PI: Num = { t: 'x', v: EX_PI, d: false };

export const nx = (v: Ex, d = false): Num => ({ t: 'x', v, d });
export const fromInt = (n: number | bigint): Num => nx(exInt(n));
export const fromQ = (q: Q, d = false): Num => nx(exQ(q), d);

/** Build an approximate number from a Decimal, rounding to 15 digits and applying range rules. */
export function na(v: Dec): Num {
  if (!v.isFinite()) throw mathError();
  const r = round15(v);
  const a = r.abs();
  if (a.gte(OVERFLOW)) throw mathError();
  if (!r.isZero() && a.lt(UNDERFLOW)) return { t: 'x', v: EX_ZERO, d: true };
  return { t: 'a', v: r };
}

export function toDec(n: Num): Dec {
  return n.t === 'a' ? n.v : exToDecimal(n.v);
}
export const toNumber = (n: Num): number => toDec(n).toNumber();

export function isExact(n: Num): n is XNum {
  return n.t === 'x';
}
export function isZero(n: Num): boolean {
  return n.t === 'x' ? exIsZero(n.v) : n.v.isZero();
}
export function sign(n: Num): -1 | 0 | 1 {
  if (n.t === 'x') return exSign(n.v);
  return n.v.isZero() ? 0 : n.v.isNeg() ? -1 : 1;
}
export function rationalOf(n: Num): Q | null {
  return n.t === 'x' ? exToQ(n.v) : null;
}
/** integer value of n if it is an exact integer (or an approximation that is integral) */
export function toBigInt(n: Num): bigint | null {
  if (n.t === 'x') {
    const q = exToQ(n.v);
    return q && q.isInt ? q.n : null;
  }
  if (!n.v.isInteger()) return null;
  return BigInt(n.v.toFixed(0));
}
export function isInteger(n: Num): boolean {
  return toBigInt(n) !== null;
}

/** Normalise an exact result: enforce representability limits, range, and degrade to approximation if needed. */
function chk(v: Ex, d: boolean): Num {
  if (v.length === 0) return { t: 'x', v, d };
  let bad = v.length > MAX_TERMS;
  let big = false;
  if (!bad) {
    for (const t of v) {
      if (t.p > MAX_PI || t.p < -MAX_PI) {
        bad = true;
        break;
      }
      const nb = bitLength(t.c.n);
      const db = bitLength(t.c.d);
      if (nb > MAX_BITS || db > MAX_BITS || bitLength(t.r) > MAX_BITS) {
        bad = true;
        break;
      }
      if (nb - db > 300 || db - nb > 300 || nb > 300) big = true;
    }
  }
  if (!bad && !big) return { t: 'x', v, d };
  const dv = exToDecimal(v);
  const a = dv.abs();
  if (a.gte(OVERFLOW)) throw mathError();
  if (a.lt(UNDERFLOW)) return { t: 'x', v: EX_ZERO, d: true };
  if (bad) return { t: 'a', v: round15(dv) };
  return { t: 'x', v, d };
}

export function add(a: Num, b: Num): Num {
  if (a.t === 'x' && b.t === 'x') return chk(exAdd(a.v, b.v), a.d || b.d);
  return na(toDec(a).add(toDec(b)));
}
export function sub(a: Num, b: Num): Num {
  if (a.t === 'x' && b.t === 'x') return chk(exSub(a.v, b.v), a.d || b.d);
  return na(toDec(a).sub(toDec(b)));
}
export function mul(a: Num, b: Num): Num {
  if (a.t === 'x' && b.t === 'x') return chk(exMul(a.v, b.v), a.d || b.d);
  return na(toDec(a).mul(toDec(b)));
}
export function div(a: Num, b: Num): Num {
  if (isZero(b)) throw mathError();
  if (a.t === 'x' && b.t === 'x') {
    const r = exDiv(a.v, b.v);
    if (r !== null) return chk(r, a.d || b.d);
  }
  return na(toDec(a).div(toDec(b)));
}
export function neg(a: Num): Num {
  return a.t === 'x' ? { t: 'x', v: exNeg(a.v), d: a.d } : { t: 'a', v: a.v.neg() };
}
export function abs(a: Num): Num {
  return sign(a) < 0 ? neg(a) : a;
}
export function cmp(a: Num, b: Num): -1 | 0 | 1 {
  if (a.t === 'x' && b.t === 'x') return exCmp(a.v, b.v);
  return toDec(a).cmp(toDec(b)) as -1 | 0 | 1;
}
export function eq(a: Num, b: Num): boolean {
  return cmp(a, b) === 0;
}
/** flag the number as "decimal preferred" (or the reverse) */
export function withDecFlag(a: Num, d: boolean): Num {
  return a.t === 'x' ? (a.d === d ? a : { t: 'x', v: a.v, d }) : a;
}
/** mark exact value as decimal-display (used by functions that normally produce decimals) */
export const asDec = (a: Num): Num => withDecFlag(a, true);

export function sqrt(a: Num): Num {
  if (sign(a) < 0) throw mathError();
  if (a.t === 'x') {
    const r = exSqrt(a.v);
    if (r !== null) return chk(r, a.d);
  }
  return na(toDec(a).sqrt());
}

export function square(a: Num): Num {
  return mul(a, a);
}

/** x^y (real). Throws Math ERROR for undefined results. */
export function pow(a: Num, b: Num): Num {
  const dflag = (a.t === 'x' ? a.d : true) || (b.t === 'x' ? b.d : true);
  const az = isZero(a);
  const bq = rationalOf(b);
  if (az) {
    if (sign(b) > 0) return nx(EX_ZERO, dflag);
    throw mathError();
  }
  if (a.t === 'x' && exToQ(a.v)?.eq(Q.ONE)) return nx(EX_ONE, dflag);
  if (bq && bq.isInt) {
    const k = Number(bq.n);
    if (Math.abs(k) > 1_000_000) return powApprox(a, b);
    if (a.t === 'x') {
      if (k === 0) return nx(EX_ONE, dflag);
      // magnitude estimate to avoid building enormous exact numbers (skipped when clearly small)
      const aq = exToQ(a.v);
      const small = aq !== null && Math.max(bitLength(aq.n), bitLength(aq.d)) * Math.abs(k) < 280;
      if (!small) {
        const lg = toDec(a).abs().log(10).mul(k);
        if (lg.gte(100.5)) throw mathError();
        if (lg.lt(-110)) return nx(EX_ZERO, true);
      }
      if (Math.abs(k) <= 2000) {
        const r = exPowInt(a.v, k);
        if (r !== null) return chk(r, dflag);
      }
    }
    return powApprox(a, b);
  }
  if (bq && a.t === 'x') {
    // rational non-integer exponent p/q, q >= 2
    const p = Number(bq.n);
    const qd = Number(bq.d);
    if (Number.isSafeInteger(p) && Number.isSafeInteger(qd) && Math.abs(p) < 10000 && qd < 10000) {
      const as = sign(a);
      if (as < 0) {
        if (qd % 2 === 0) throw mathError();
        const r = pow(neg(a), b);
        return p % 2 === 0 ? r : neg(r);
      }
      const base = exToQ(a.v);
      if (qd === 2) {
        const ap = exPowInt(a.v, p);
        if (ap !== null) {
          const s = exSqrt(ap);
          if (s !== null) return chk(s, dflag);
        }
      } else if (base) {
        const root = qRoot(base, qd);
        if (root) {
          const r = exPowInt(exQ(root), p);
          if (r !== null) return chk(r, dflag);
        }
      }
    }
  }
  // generic real power
  if (sign(a) < 0) {
    throw mathError();
  }
  return powApprox(a, b);
}

function powApprox(a: Num, b: Num): Num {
  const x = toDec(a);
  const y = toDec(b);
  const lg = x.abs().log(10).mul(y);
  if (lg.gte(100.5)) throw mathError();
  if (lg.lt(-110)) return nx(EX_ZERO, true);
  return na(x.pow(y));
}

export function numIntPow(a: Num, k: number): Num {
  return pow(a, fromInt(k));
}

export function floorNum(a: Num): Num {
  if (a.t === 'x') {
    const q = exToQ(a.v);
    if (q) return nx(exQ(Q.of(q.floor())), a.d);
  }
  return fromInt(BigInt(toDec(a).floor().toFixed(0)));
}

export function minMax(list: Num[], isMax: boolean): Num {
  let best = list[0];
  for (const x of list) if (isMax ? cmp(x, best) > 0 : cmp(x, best) < 0) best = x;
  return best;
}

