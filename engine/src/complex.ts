// Complex scalars built from exact/approximate Num parts.

import { D } from './dec';
import { mathError } from './errors';
import * as F from './mathfn';
import type { AngleUnit } from './mathfn';
import * as N from './num';
import type { Num } from './num';
import { Q } from './rational';

export interface CxVal {
  readonly t: 'c';
  readonly re: Num;
  readonly im: Num;
}
export type Scalar = Num | CxVal;

export const isCx = (v: unknown): v is CxVal => !!v && (v as { t?: string }).t === 'c';
export const isNum = (v: unknown): v is Num => !!v && ((v as { t?: string }).t === 'x' || (v as { t?: string }).t === 'a');

/** build a complex value, collapsing to a real Num when the imaginary part is exactly zero */
export function mkC(re: Num, im: Num): Scalar {
  return N.isZero(im) ? re : { t: 'c', re, im };
}
export const reOf = (v: Scalar): Num => (isCx(v) ? v.re : v);
export const imOf = (v: Scalar): Num => (isCx(v) ? v.im : N.ZERO);
export const I: CxVal = { t: 'c', re: N.ZERO, im: N.ONE };

export function cAdd(a: Scalar, b: Scalar): Scalar {
  if (!isCx(a) && !isCx(b)) return N.add(a, b);
  return mkC(N.add(reOf(a), reOf(b)), N.add(imOf(a), imOf(b)));
}
export function cSub(a: Scalar, b: Scalar): Scalar {
  if (!isCx(a) && !isCx(b)) return N.sub(a, b);
  return mkC(N.sub(reOf(a), reOf(b)), N.sub(imOf(a), imOf(b)));
}
export function cMul(a: Scalar, b: Scalar): Scalar {
  if (!isCx(a) && !isCx(b)) return N.mul(a, b);
  const [p, q, r, s] = [reOf(a), imOf(a), reOf(b), imOf(b)];
  return mkC(N.sub(N.mul(p, r), N.mul(q, s)), N.add(N.mul(p, s), N.mul(q, r)));
}
export function cDiv(a: Scalar, b: Scalar): Scalar {
  if (!isCx(a) && !isCx(b)) return N.div(a, b);
  const [p, q, r, s] = [reOf(a), imOf(a), reOf(b), imOf(b)];
  const den = N.add(N.mul(r, r), N.mul(s, s));
  if (N.isZero(den)) throw mathError();
  return mkC(N.div(N.add(N.mul(p, r), N.mul(q, s)), den), N.div(N.sub(N.mul(q, r), N.mul(p, s)), den));
}
export function cNeg(a: Scalar): Scalar {
  return isCx(a) ? { t: 'c', re: N.neg(a.re), im: N.neg(a.im) } : N.neg(a);
}
export function cConj(a: Scalar): Scalar {
  return isCx(a) ? { t: 'c', re: a.re, im: N.neg(a.im) } : a;
}
export function cAbs(a: Scalar): Num {
  if (!isCx(a)) return N.abs(a);
  return N.sqrt(N.add(N.mul(a.re, a.re), N.mul(a.im, a.im)));
}
export function cArg(a: Scalar, unit: AngleUnit): Num {
  if (!isCx(a)) {
    if (N.isZero(a)) throw mathError();
    return N.sign(a) > 0 ? N.ZERO : F.fromDegrees(N.fromInt(180), unit);
  }
  return F.atan2(a.im, a.re, unit);
}
export const cIsZero = (a: Scalar): boolean => !isCx(a) && N.isZero(a);

export function cSqrt(a: Scalar): Scalar {
  if (!isCx(a)) {
    if (N.sign(a) >= 0) return N.sqrt(a);
    return mkC(N.ZERO, N.sqrt(N.neg(a)));
  }
  const m = cAbs(a);
  const two = N.fromInt(2);
  const re = N.sqrt(N.div(N.add(m, a.re), two));
  const im = N.sqrt(N.div(N.sub(m, a.re), two));
  return mkC(re, N.sign(a.im) < 0 ? N.neg(im) : im);
}

export function cExp(a: Scalar): Scalar {
  if (!isCx(a)) return F.exp(a);
  const m = F.exp(a.re);
  const c = F.cos(a.im, 'rad');
  const s = F.sin(a.im, 'rad');
  return mkC(N.mul(m, c), N.mul(m, s));
}

export function cLn(a: Scalar): Scalar {
  if (!isCx(a) && N.sign(a) > 0) return F.ln(a);
  if (cIsZero(a)) throw mathError();
  return mkC(F.ln(cAbs(a)), cArg(a, 'rad'));
}

export function cPowInt(a: Scalar, k: number): Scalar {
  if (k === 0) return N.ONE;
  if (k < 0) return cDiv(N.ONE, cPowInt(a, -k));
  let result: Scalar = N.ONE;
  let base = a;
  let n = k;
  while (n > 0) {
    if (n & 1) result = cMul(result, base);
    n >>= 1;
    if (n > 0) base = cMul(base, base);
  }
  return result;
}

export function cPow(a: Scalar, b: Scalar): Scalar {
  if (!isCx(a) && !isCx(b) && (N.sign(a) >= 0 || N.isInteger(b))) {
    // real base & exponent: stay real whenever the real power is defined; otherwise use the principal value
    return N.pow(a, b);
  }
  if (!isCx(b)) {
    const bi = N.toBigInt(b);
    if (bi !== null && bi >= -1000n && bi <= 1000n) return cPowInt(a, Number(bi));
    const bq = N.rationalOf(b);
    if (bq && bq.d === 2n && bq.n === 1n) return cSqrt(a);
  }
  if (cIsZero(a)) {
    if (!isCx(b) && N.sign(b) > 0) return N.ZERO;
    throw mathError();
  }
  return cExp(cMul(b, cLn(a)));
}

// -- trig / hyperbolic on complex values (arguments of trig functions follow the angle unit)

// For sin/cos of x+iy the real part follows the angle unit, the imaginary part is a plain hyperbolic argument.
export function cSin(a: Scalar, unit: AngleUnit): Scalar {
  if (!isCx(a)) return F.sin(a, unit);
  return mkC(N.mul(F.sin(a.re, unit), F.cosh(a.im)), N.mul(F.cos(a.re, unit), F.sinh(a.im)));
}
export function cCos(a: Scalar, unit: AngleUnit): Scalar {
  if (!isCx(a)) return F.cos(a, unit);
  return mkC(N.mul(F.cos(a.re, unit), F.cosh(a.im)), N.neg(N.mul(F.sin(a.re, unit), F.sinh(a.im))));
}
export function cTan(a: Scalar, unit: AngleUnit): Scalar {
  if (!isCx(a)) return F.tan(a, unit);
  return cDiv(cSin(a, unit), cCos(a, unit));
}
export function cSinh(a: Scalar): Scalar {
  if (!isCx(a)) return F.sinh(a);
  return mkC(N.mul(F.sinh(a.re), F.cos(a.im, 'rad')), N.mul(F.cosh(a.re), F.sin(a.im, 'rad')));
}
export function cCosh(a: Scalar): Scalar {
  if (!isCx(a)) return F.cosh(a);
  return mkC(N.mul(F.cosh(a.re), F.cos(a.im, 'rad')), N.mul(F.sinh(a.re), F.sin(a.im, 'rad')));
}
export function cTanh(a: Scalar): Scalar {
  if (!isCx(a)) return F.tanh(a);
  return cDiv(cSinh(a), cCosh(a));
}

const fromRadScalar = (a: Scalar, unit: AngleUnit): Scalar =>
  unit === 'rad' ? a : mkC(F.fromRadiansNum(reOf(a), unit), F.fromRadiansNum(imOf(a), unit));

/** asin z = −i ln(iz + √(1−z²)) ; result in the angle unit */
export function cAsin(a: Scalar, unit: AngleUnit): Scalar {
  if (!isCx(a) && N.cmp(N.abs(a), N.ONE) <= 0) return F.asin(a, unit);
  const iz = cMul(I, a);
  const root = cSqrt(cSub(N.ONE, cMul(a, a)));
  const r = cMul(cNeg(I), cLn(cAdd(iz, root)));
  return fromRadScalar(r, unit);
}
export function cAcos(a: Scalar, unit: AngleUnit): Scalar {
  if (!isCx(a) && N.cmp(N.abs(a), N.ONE) <= 0) return F.acos(a, unit);
  const halfPi = N.nx([{ p: 1, r: 1n, c: Q.of(1, 2) }]);
  const r = cSub(halfPi, cAsin(a, 'rad'));
  return fromRadScalar(r, unit);
}
export function cAtan(a: Scalar, unit: AngleUnit): Scalar {
  if (!isCx(a)) return F.atan(a, unit);
  // atan z = (i/2) ln((i+z)/(i−z))   (principal value)
  const num = cAdd(I, a);
  const den = cSub(I, a);
  if (cIsZero(den)) throw mathError();
  const r = cMul(cDiv(I, N.fromInt(2)), cLn(cDiv(num, den)));
  return fromRadScalar(r, unit);
}

/** polar -> rectangular with exact trig:  r∠θ  (θ in angle unit) */
export function fromPolar(r: Num, theta: Num, unit: AngleUnit): Scalar {
  return mkC(N.mul(r, F.cos(theta, unit)), N.mul(r, F.sin(theta, unit)));
}

export const decE = (): Num => N.na(new D(1).exp());
