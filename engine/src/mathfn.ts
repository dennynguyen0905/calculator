// Real-valued scalar functions on Num with exact special cases and 15-digit decimal fallback.

import { D, type Dec } from './dec';
import { factorize, gcd as bgcd, lcm as blcm } from './bigmath';
import { mathError } from './errors';
import { exAdd, exCmp, exDiv, exNeg, exPiMultiple, exQ, exToQ, type Ex } from './exact';
import * as N from './num';
import type { Num } from './num';
import { Q } from './rational';

export type AngleUnit = 'deg' | 'rad' | 'gra';

const exSqrtInt = (r: number, c: Q = Q.ONE): Ex => [{ p: 0, r: BigInt(r), c }];
const q = (n: number, d = 1) => Q.of(n, d);

// ---------------------------------------------------------------- angles

const PI_DEC = (): Dec => D.acos(-1);

/** angle expressed as a rational multiple of π, when exactly known */
function angleAsPiMultiple(x: Num, unit: AngleUnit): Q | null {
  if (x.t !== 'x') return null;
  if (unit === 'rad') return exPiMultiple(x.v);
  const r = exToQ(x.v);
  if (!r) return null;
  return unit === 'deg' ? r.div(q(180)) : r.div(q(200));
}

/** convert an angle in the given unit to radians (exact when possible) */
export function toRadians(x: Num, unit: AngleUnit): Num {
  if (unit === 'rad') return x;
  const f = unit === 'deg' ? q(1, 180) : q(1, 200);
  return N.mul(x, N.nx([{ p: 1, r: 1n, c: f }]));
}

/** convert an angle in degrees (as Num) to the given unit */
export function fromDegrees(deg: Num, unit: AngleUnit): Num {
  if (unit === 'deg') return deg;
  if (unit === 'rad') return N.mul(deg, N.nx([{ p: 1, r: 1n, c: q(1, 180) }]));
  return N.mul(deg, N.fromQ(q(10, 9)));
}

/** convert a radian value to the given angle unit */
export function fromRadiansNum(rad: Num, unit: AngleUnit): Num {
  if (unit === 'rad') return rad;
  const f = unit === 'deg' ? q(180) : q(200);
  return N.mul(rad, N.nx([{ p: -1, r: 1n, c: f }]));
}

// ---------------------------------------------------------------- exact trig table (multiples of 15°)

const S6 = (c: Q): Ex => exSqrtInt(6, c);
const SIN_TABLE: Ex[] = (() => {
  const s2 = (c: Q) => exSqrtInt(2, c);
  return [
    [], // 0
    exAdd(S6(q(1, 4)), s2(q(-1, 4))), // 15°  (√6−√2)/4
    exQ(q(1, 2)), // 30°
    s2(q(1, 2)), // 45°
    exSqrtInt(3, q(1, 2)), // 60°
    exAdd(S6(q(1, 4)), s2(q(1, 4))), // 75°  (√6+√2)/4
    exQ(q(1)), // 90°
  ];
})();

/** sin(kπ/12) for integer k, exactly */
function sinK(k: number): Ex {
  k = ((k % 24) + 24) % 24;
  let sign = 1;
  if (k >= 12) {
    sign = -1;
    k -= 12;
  }
  if (k > 6) k = 12 - k;
  const v = SIN_TABLE[k];
  return sign < 0 ? exNeg(v) : v;
}

function twelfths(qv: Q): number | null {
  const t = qv.mul(q(12));
  return t.isInt ? Number(((t.n % 24n) + 24n) % 24n) : null;
}

function decTrigArg(x: Num, unit: AngleUnit): Dec {
  const pm = angleAsPiMultiple(x, unit);
  if (pm) return pm.mod(q(2)).toDecimal().mul(PI_DEC());
  const v = N.toDec(x);
  if (unit === 'rad') return v;
  return v.mul(PI_DEC()).div(unit === 'deg' ? 180 : 200);
}

export function sin(x: Num, unit: AngleUnit): Num {
  const pm = angleAsPiMultiple(x, unit);
  if (pm) {
    const k = twelfths(pm);
    if (k !== null) return N.nx(sinK(k), xd(x));
  }
  return N.na(D.sin(decTrigArg(x, unit)));
}
export function cos(x: Num, unit: AngleUnit): Num {
  const pm = angleAsPiMultiple(x, unit);
  if (pm) {
    const k = twelfths(pm);
    if (k !== null) return N.nx(sinK(k + 6), xd(x));
  }
  return N.na(D.cos(decTrigArg(x, unit)));
}
export function tan(x: Num, unit: AngleUnit): Num {
  const pm = angleAsPiMultiple(x, unit);
  if (pm) {
    const k = twelfths(pm);
    if (k !== null) {
      const c = sinK(k + 6);
      if (c.length === 0) throw mathError();
      const r = exDiv(sinK(k), c);
      if (r) return N.nx(r, xd(x));
    }
    // odd multiples of 90° are poles even when not a multiple of 15° (cannot happen) ; fallthrough
  }
  const arg = decTrigArg(x, unit);
  const c = D.cos(arg);
  if (c.abs().lt(new D('1e-40'))) throw mathError();
  return N.na(D.sin(arg).div(c));
}

const xd = (n: Num): boolean => (n.t === 'x' ? n.d : true);

// ---------------------------------------------------------------- inverse trig (exact special values)

const ex = (...terms: [number, number, Q][]): Ex =>
  terms.reduce<Ex>((acc, [p, r, c]) => exAdd(acc, [{ p, r: BigInt(r), c }]), []);

const ASIN_TABLE: [Ex, number][] = [
  [[], 0],
  [exQ(q(1, 2)), 30],
  [exSqrtInt(2, q(1, 2)), 45],
  [exSqrtInt(3, q(1, 2)), 60],
  [exQ(q(1)), 90],
  [ex([0, 2, q(-1, 4)], [0, 6, q(1, 4)]), 15],
  [ex([0, 2, q(1, 4)], [0, 6, q(1, 4)]), 75],
];
const ATAN_TABLE: [Ex, number][] = [
  [[], 0],
  [exQ(q(1)), 45],
  [exSqrtInt(3, q(1, 3)), 30],
  [exSqrtInt(3, q(1)), 60],
  [ex([0, 1, q(2)], [0, 3, q(-1)]), 15],
  [ex([0, 1, q(2)], [0, 3, q(1)]), 75],
];

function tableLookup(table: [Ex, number][], x: Num): number | null {
  if (x.t !== 'x') return null;
  const neg = N.sign(x) < 0;
  const ax = neg ? exNeg(x.v) : x.v;
  for (const [v, deg] of table) {
    if (exCmp(v, ax) === 0) return neg ? -deg : deg;
  }
  return null;
}

function degToUnit(deg: Num, unit: AngleUnit): Num {
  return fromDegrees(deg, unit);
}

function decRadToUnit(rad: Dec, unit: AngleUnit): Num {
  if (unit === 'rad') return N.na(rad);
  return N.na(rad.mul(unit === 'deg' ? 180 : 200).div(PI_DEC()));
}

export function asin(x: Num, unit: AngleUnit): Num {
  if (N.cmp(N.abs(x), N.ONE) > 0) throw mathError();
  const deg = tableLookup(ASIN_TABLE, x);
  if (deg !== null) return N.withDecFlag(degToUnit(N.fromInt(deg), unit), xd(x));
  return decRadToUnit(D.asin(N.toDec(x)), unit);
}
export function acos(x: Num, unit: AngleUnit): Num {
  if (N.cmp(N.abs(x), N.ONE) > 0) throw mathError();
  const deg = tableLookup(ASIN_TABLE, x);
  if (deg !== null) return N.withDecFlag(degToUnit(N.fromInt(90 - deg), unit), xd(x));
  return decRadToUnit(D.acos(N.toDec(x)), unit);
}
export function atan(x: Num, unit: AngleUnit): Num {
  const deg = tableLookup(ATAN_TABLE, x);
  if (deg !== null) return N.withDecFlag(degToUnit(N.fromInt(deg), unit), xd(x));
  return decRadToUnit(D.atan(N.toDec(x)), unit);
}

/** atan2 in the given unit, result in (−180°, 180°] */
export function atan2(y: Num, x: Num, unit: AngleUnit): Num {
  const sx = N.sign(x);
  const sy = N.sign(y);
  if (sx === 0 && sy === 0) throw mathError();
  const half = fromDegrees(N.fromInt(90), unit);
  const straight = fromDegrees(N.fromInt(180), unit);
  if (sx === 0) return sy > 0 ? half : N.neg(half);
  const base = atan(N.div(y, x), unit);
  if (sx > 0) return base;
  return sy >= 0 ? N.add(base, straight) : N.sub(base, straight);
}

// ---------------------------------------------------------------- hyperbolic

export function sinh(x: Num): Num {
  return N.isZero(x) ? N.ZERO : N.na(N.toDec(x).sinh());
}
export function cosh(x: Num): Num {
  return N.isZero(x) ? N.ONE : N.na(N.toDec(x).cosh());
}
export function tanh(x: Num): Num {
  return N.isZero(x) ? N.ZERO : N.na(N.toDec(x).tanh());
}
export function asinh(x: Num): Num {
  return N.isZero(x) ? N.ZERO : N.na(N.toDec(x).asinh());
}
export function acosh(x: Num): Num {
  if (N.cmp(x, N.ONE) < 0) throw mathError();
  return N.cmp(x, N.ONE) === 0 ? N.ZERO : N.na(N.toDec(x).acosh());
}
export function atanh(x: Num): Num {
  if (N.cmp(N.abs(x), N.ONE) >= 0) throw mathError();
  return N.isZero(x) ? N.ZERO : N.na(N.toDec(x).atanh());
}

// ---------------------------------------------------------------- exp / log

export function exp(x: Num): Num {
  if (N.isZero(x)) return N.ONE;
  const v = N.toDec(x);
  if (v.gte(230.26)) throw mathError(); // e^230.26 ≈ 1e100
  if (v.lte(-230)) return N.nx([], true);
  return N.na(v.exp());
}

export function ln(x: Num): Num {
  if (N.sign(x) <= 0) throw mathError();
  if (N.cmp(x, N.ONE) === 0) return N.withDecFlag(N.ZERO, xd(x));
  return N.na(N.toDec(x).ln());
}

function primeVector(r: Q): Map<bigint, Q> | null {
  if (r.n > 10n ** 20n || r.d > 10n ** 20n) return null;
  const m = new Map<bigint, Q>();
  for (const [p, e] of factorize(r.n)) m.set(p, Q.of(e));
  for (const [p, e] of factorize(r.d)) m.set(p, (m.get(p) ?? Q.ZERO).sub(Q.of(e)));
  return m;
}

/** log_b(x), exact when x is a rational power of b */
export function logBase(b: Num, x: Num): Num {
  if (N.sign(x) <= 0 || N.sign(b) <= 0 || N.cmp(b, N.ONE) === 0) throw mathError();
  const dflag = xd(x) || xd(b);
  const bq = N.rationalOf(b);
  const xq = N.rationalOf(x);
  if (bq && xq) {
    if (xq.eq(Q.ONE)) return N.withDecFlag(N.ZERO, dflag);
    const vb = primeVector(bq);
    const vx = primeVector(xq);
    if (vb && vx) {
      let t: Q | null = null;
      let ok = true;
      const primes = new Set<bigint>([...vb.keys(), ...vx.keys()]);
      for (const p of primes) {
        const eb = vb.get(p) ?? Q.ZERO;
        const exx = vx.get(p) ?? Q.ZERO;
        if (eb.isZero) {
          if (!exx.isZero) {
            ok = false;
            break;
          }
          continue;
        }
        const ratio = exx.div(eb);
        if (t === null) t = ratio;
        else if (!t.eq(ratio)) {
          ok = false;
          break;
        }
      }
      if (ok && t !== null) return N.fromQ(t, dflag);
    }
  }
  return N.na(N.toDec(x).ln().div(N.toDec(b).ln()));
}
export const log10 = (x: Num): Num => logBase(N.fromInt(10), x);

// ---------------------------------------------------------------- integer functions

const LIMIT = 10n ** 100n;

export function factorial(x: Num): Num {
  const n = N.toBigInt(x);
  if (n === null || n < 0n || n > 69n) throw mathError();
  let r = 1n;
  for (let i = 2n; i <= n; i++) r *= i;
  return N.nx(exQ(Q.of(r)), xd(x));
}

function nonNegInts(a: Num, b: Num): [bigint, bigint] {
  const n = N.toBigInt(a);
  const r = N.toBigInt(b);
  if (n === null || r === null || n < 0n || r < 0n || r > n || n >= 10_000_000_000n) throw mathError();
  return [n, r];
}

export function nPr(a: Num, b: Num): Num {
  const [n, r] = nonNegInts(a, b);
  let res = 1n;
  for (let i = 0n; i < r; i++) {
    res *= n - i;
    if (res >= LIMIT) throw mathError();
  }
  return N.nx(exQ(Q.of(res)), xd(a) || xd(b));
}

export function nCr(a: Num, b: Num): Num {
  const [n, r0] = nonNegInts(a, b);
  const r = r0 > n - r0 ? n - r0 : r0;
  let res = 1n;
  for (let i = 0n; i < r; i++) {
    res = (res * (n - i)) / (i + 1n);
    if (res >= LIMIT) throw mathError();
  }
  return N.nx(exQ(Q.of(res)), xd(a) || xd(b));
}

function intArg(x: Num): bigint {
  const n = N.toBigInt(x);
  if (n === null || n >= 10_000_000_000n || n <= -10_000_000_000n) throw mathError();
  return n;
}

export function gcdNum(a: Num, b: Num): Num {
  const x = intArg(a);
  const y = intArg(b);
  return N.nx(exQ(Q.of(bgcd(x, y))), false);
}
export function lcmNum(a: Num, b: Num): Num {
  const x = intArg(a);
  const y = intArg(b);
  const r = blcm(x, y);
  if (r >= LIMIT) throw mathError();
  return N.nx(exQ(Q.of(r)), false);
}

/** integer division with remainder: ÷R and Quotient/Rem. a ÷R b => (q, r) with sign of a */
export function divRem(a: Num, b: Num): [Num, Num] {
  const x = N.toBigInt(a);
  const y = N.toBigInt(b);
  if (x === null || y === null) throw mathError();
  if (y === 0n) throw mathError();
  const lim = 10_000_000_000n;
  if (x >= lim || x <= -lim || y >= lim || y <= -lim) throw mathError();
  const qq = x / y; // truncates toward zero
  const rr = x - qq * y;
  return [N.fromInt(qq), N.fromInt(rr)];
}

export function intPart(x: Num): Num {
  if (N.sign(x) >= 0) return N.floorNum(x);
  return N.neg(N.floorNum(N.neg(x)));
}
export const intg = (x: Num): Num => N.floorNum(x);
export function fracPart(x: Num): Num {
  return N.sub(x, intPart(x));
}

export function absNum(x: Num): Num {
  return N.abs(x);
}

export function cbrt(x: Num): Num {
  const neg = N.sign(x) < 0;
  const ax = neg ? N.neg(x) : x;
  let r: Num;
  const rq = N.rationalOf(ax);
  if (rq) {
    r = N.pow(ax, N.fromQ(q(1, 3)));
    // N.pow already yields exact result for perfect cubes; otherwise approximation
  } else {
    r = N.na(N.toDec(ax).cbrt());
  }
  return neg ? N.neg(r) : r;
}

/** y-th root of x:  x^(1/y) ; negative x allowed for odd integer y */
export function nthRoot(y: Num, x: Num): Num {
  if (N.isZero(y)) throw mathError();
  const inv = N.div(N.ONE, y);
  if (N.sign(x) < 0) {
    const yi = N.toBigInt(y);
    if (yi === null || yi % 2n === 0n) throw mathError();
    return N.neg(N.pow(N.neg(x), inv));
  }
  return N.pow(x, inv);
}

export function percent(x: Num): Num {
  return N.div(x, N.fromInt(100));
}
