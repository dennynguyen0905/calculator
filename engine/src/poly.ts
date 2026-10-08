// Equation solving for EQN mode: simultaneous linear systems and polynomials up to degree 4,
// with exact roots (fractions, radicals, complex) whenever possible.

import { D } from './dec';
import { babs, factorize, gcd, lcm } from './bigmath';
import * as C from './complex';
import { mathError } from './errors';
import { exToQ } from './exact';
import * as N from './num';
import type { Num } from './num';
import { Q } from './rational';

// ------------------------------------------------------------------ simultaneous linear equations

/** Solve A x = b for an n×n system given as augmented rows [a1 ... an | c]. Exact when possible. */
export function solveLinear(aug: Num[][]): Num[] {
  const n = aug.length;
  const m = aug.map((r) => r.slice());
  for (let c = 0; c < n; c++) {
    let p = -1;
    // prefer the largest pivot for approximate inputs, any non-zero for exact
    for (let r = c; r < n; r++) {
      if (N.isZero(m[r][c])) continue;
      if (p < 0 || N.cmp(N.abs(m[r][c]), N.abs(m[p][c])) > 0) p = r;
    }
    if (p < 0) throw mathError(); // singular
    [m[p], m[c]] = [m[c], m[p]];
    const piv = m[c][c];
    for (let k = c; k <= n; k++) m[c][k] = N.div(m[c][k], piv);
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (N.isZero(f)) continue;
      for (let k = c; k <= n; k++) m[r][k] = N.sub(m[r][k], N.mul(f, m[c][k]));
    }
  }
  return m.map((r) => r[n]);
}

// ------------------------------------------------------------------ polynomials

export interface Roots {
  roots: C.Scalar[];
  /** all roots equal (shown as a single "x=") */
  single: boolean;
}

const q0 = Q.ZERO;

function quadratic(a: Num, b: Num, c: Num): Roots {
  const disc = N.sub(N.mul(b, b), N.mul(N.fromInt(4), N.mul(a, c)));
  const two_a = N.mul(N.fromInt(2), a);
  const mb = N.neg(b);
  const s = N.sign(disc);
  if (s === 0) return { roots: [N.div(mb, two_a)], single: true };
  if (s > 0) {
    const r = N.sqrt(disc);
    return { roots: [N.div(N.add(mb, r), two_a), N.div(N.sub(mb, r), two_a)], single: false };
  }
  const r = N.sqrt(N.neg(disc));
  const re = N.div(mb, two_a);
  const im = N.div(r, two_a);
  return { roots: [C.mkC(re, im), C.mkC(re, N.neg(im))], single: false };
}

function ratCoeffs(co: Num[]): Q[] | null {
  const out: Q[] = [];
  for (const x of co) {
    const q = N.rationalOf(x);
    if (!q) return null;
    out.push(q);
  }
  return out;
}

function divisors(n: bigint): bigint[] | null {
  if (n === 0n) return [];
  const f = factorize(babs(n));
  let ds: bigint[] = [1n];
  for (const [p, e] of f) {
    const next: bigint[] = [];
    for (const d of ds) {
      let pk = 1n;
      for (let i = 0; i <= e; i++) {
        next.push(d * pk);
        pk *= p;
      }
    }
    ds = next;
    if (ds.length > 20000) return null;
  }
  return ds;
}

function horner(co: Q[], x: Q): Q {
  let r = q0;
  for (const c of co) r = r.mul(x).add(c);
  return r;
}

function deflate(co: Q[], r: Q): Q[] {
  // synthetic division by (x - r)
  const out: Q[] = [];
  let carry = q0;
  for (let i = 0; i < co.length - 1; i++) {
    carry = carry.mul(r).add(co[i]);
    out.push(carry);
  }
  return out;
}

/** find rational roots of a polynomial with rational coefficients (highest degree first) */
function rationalRoots(co0: Q[]): { roots: Q[]; rest: Q[] } | null {
  let co = co0.slice();
  const roots: Q[] = [];
  // clear denominators
  const den = co.reduce((l, q) => lcm(l, q.d), 1n);
  let ints = co.map((q) => q.n * (den / q.d));
  const g = ints.reduce((a, b) => gcd(a, b), 0n);
  if (g > 1n) ints = ints.map((x) => x / g);
  co = ints.map((x) => Q.of(x));
  // zero roots
  while (co.length > 1 && co[co.length - 1].isZero) {
    roots.push(q0);
    co.pop();
  }
  for (;;) {
    if (co.length <= 3) break;
    const an = co[0].n;
    const a0 = co[co.length - 1].n;
    if (babs(a0) > 10n ** 12n || babs(an) > 10n ** 12n) return roots.length ? { roots, rest: co } : null;
    const dp = divisors(a0);
    const dq = divisors(an);
    if (!dp || !dq) return roots.length ? { roots, rest: co } : null;
    let found: Q | null = null;
    outer: for (const p of dp) {
      for (const q of dq) {
        for (const sgn of [1n, -1n]) {
          const cand = Q.of(sgn * p, q);
          if (horner(co, cand).isZero) {
            found = cand;
            break outer;
          }
        }
      }
    }
    if (!found) break;
    roots.push(found);
    co = deflate(co, found);
  }
  return { roots, rest: co };
}

// numeric fallback: Durand–Kerner followed by Newton polishing, in double precision
function numericRoots(co: number[]): [number, number][] {
  const n = co.length - 1;
  const a = co.map((x) => x / co[0]);
  const R = 1 + Math.max(...a.slice(1).map(Math.abs));
  let z: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const ang = (2 * Math.PI * k) / n + 0.4;
    z.push([R * 0.7 * Math.cos(ang), R * 0.7 * Math.sin(ang)]);
  }
  const mul = (p: [number, number], q: [number, number]): [number, number] => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
  const sub = (p: [number, number], q: [number, number]): [number, number] => [p[0] - q[0], p[1] - q[1]];
  const div = (p: [number, number], q: [number, number]): [number, number] => {
    const d = q[0] * q[0] + q[1] * q[1] || 1e-300;
    return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
  };
  const poly = (x: [number, number]): [number, number] => {
    let r: [number, number] = [0, 0];
    for (const c of a) {
      r = mul(r, x);
      r[0] += c;
    }
    return r;
  };
  const dpoly = (x: [number, number]): [number, number] => {
    let r: [number, number] = [0, 0];
    const m = a.length - 1;
    for (let i = 0; i < m; i++) {
      r = mul(r, x);
      r[0] += a[i] * (m - i);
    }
    return r;
  };
  for (let it = 0; it < 800; it++) {
    let delta = 0;
    const next = z.map((zi, i) => {
      let den: [number, number] = [1, 0];
      for (let j = 0; j < n; j++) if (j !== i) den = mul(den, sub(zi, z[j]));
      const corr = div(poly(zi), den);
      delta = Math.max(delta, Math.hypot(corr[0], corr[1]));
      return sub(zi, corr);
    });
    z = next;
    if (delta < 1e-15 * R) break;
  }
  // polish each root with Newton on the full polynomial
  z = z.map((zi) => {
    let x = zi;
    for (let it = 0; it < 30; it++) {
      const d = dpoly(x);
      if (d[0] === 0 && d[1] === 0) break;
      const step = div(poly(x), d);
      const nx = sub(x, step);
      if (Math.hypot(step[0], step[1]) <= 1e-17 * Math.max(1, Math.hypot(nx[0], nx[1]))) {
        x = nx;
        break;
      }
      x = nx;
    }
    return x;
  });
  return z;
}

function fromDouble(re: number, im: number, scale: number): C.Scalar {
  const tol = 1e-9 * Math.max(1, scale);
  const r = Math.abs(re) < tol * 1e-3 ? 0 : re;
  if (Math.abs(im) < tol) return N.na(new D(r));
  return C.mkC(N.na(new D(r)), N.na(new D(im)));
}

function sortRoots(rs: C.Scalar[]): C.Scalar[] {
  const key = (s: C.Scalar): [number, number] => [N.toNumber(C.reOf(s)), N.toNumber(C.imOf(s))];
  return rs
    .map((r) => ({ r, k: key(r) }))
    .sort((a, b) => (Math.abs(a.k[0] - b.k[0]) > 1e-12 ? a.k[0] - b.k[0] : a.k[1] - b.k[1]))
    .map((x) => x.r);
}

/** y = x² roots -> x roots (for biquadratic quartics) */
function squareRoots(ys: C.Scalar[]): C.Scalar[] {
  const out: C.Scalar[] = [];
  for (const y of ys) {
    if (!C.isCx(y)) {
      const s = N.sign(y);
      if (s === 0) {
        out.push(N.ZERO, N.ZERO);
      } else if (s > 0) {
        const r = N.sqrt(y);
        out.push(r, N.neg(r));
      } else {
        const r = N.sqrt(N.neg(y));
        out.push(C.mkC(N.ZERO, r), C.mkC(N.ZERO, N.neg(r)));
      }
    } else {
      const r = C.cSqrt(y);
      out.push(r, C.cNeg(r));
    }
  }
  return out;
}

/** Roots of a_n x^n + ... + a_0 (coefficients highest degree first). */
export function solvePolynomial(co: Num[]): Roots {
  const n = co.length - 1;
  if (n < 1 || N.isZero(co[0])) throw mathError();
  if (n === 1) return { roots: [N.div(N.neg(co[1]), co[0])], single: true };
  if (n === 2) return quadratic(co[0], co[1], co[2]);

  const rat = ratCoeffs(co);
  const roots: C.Scalar[] = [];
  let rest: Num[] = co;
  if (rat) {
    const rr = rationalRoots(rat);
    if (rr) {
      for (const r of rr.roots) roots.push(N.fromQ(r));
      rest = rr.rest.map((q) => N.fromQ(q));
    }
  }
  const m = rest.length - 1;
  if (m === 2) {
    const r = quadratic(rest[0], rest[1], rest[2]);
    if (r.single) roots.push(r.roots[0], r.roots[0]);
    else roots.push(...r.roots);
  } else if (m === 1) {
    roots.push(N.div(N.neg(rest[1]), rest[0]));
  } else if (m === 4 && N.isZero(rest[1]) && N.isZero(rest[3])) {
    const q = quadratic(rest[0], rest[2], rest[4]);
    const ys = q.single ? [q.roots[0], q.roots[0]] : q.roots;
    roots.push(...squareRoots(ys));
  } else if (m >= 3) {
    const nums = rest.map((x) => N.toNumber(x));
    const scale = Math.max(...nums.map(Math.abs));
    for (const [re, im] of numericRoots(nums)) roots.push(fromDouble(re, im, scale));
  }
  const all = roots.length === n ? sortRoots(roots) : roots;
  const first = all[0];
  const single = all.every((r) => C.isCx(r) === C.isCx(first) && N.eq(C.reOf(r), C.reOf(first)) && N.eq(C.imOf(r), C.imOf(first)));
  return { roots: single ? [first] : all, single };
}

export { exToQ };
