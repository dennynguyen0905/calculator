// Double-precision fast path for numeric ∫ and d/dx. Compiles an AST into a JS closure of x.
// Returns null when the expression uses something unsupported (caller falls back to the exact evaluator).

import type { Ast } from './ast';
import type { AngleUnit } from './mathfn';

export type Fn1 = (x: number) => number;

export interface FastEnv {
  angle: AngleUnit;
  /** value of a named variable other than the integration variable (A..F, M, Y, Ans, ...), or undefined */
  varValue(name: string): number | undefined;
}

const toRadFactor = (u: AngleUnit): number => (u === 'deg' ? Math.PI / 180 : u === 'gra' ? Math.PI / 200 : 1);

function fact(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function compileFast(ast: Ast, env: FastEnv, xName = 'X'): Fn1 | null {
  const k = toRadFactor(env.angle);
  const build = (a: Ast): Fn1 | null => {
    switch (a.k) {
      case 'num': {
        if (a.radix !== 10) return null;
        let v = Number(a.text);
        if (Number.isNaN(v)) return null;
        if (a.exp) {
          const e = build(a.exp);
          if (!e) return null;
          v *= Math.pow(10, e(0));
        }
        return () => v;
      }
      case 'id': {
        if (a.name === xName) return (x) => x;
        if (a.name === 'π') return () => Math.PI;
        if (a.name === 'e') return () => Math.E;
        const v = env.varValue(a.name);
        if (v === undefined) return null;
        return () => v;
      }
      case 'neg': {
        const f = build(a.a);
        return f && ((x) => -f(x));
      }
      case 'paren':
        return build(a.a);
      case 'post': {
        const f = build(a.a);
        if (!f) return null;
        if (a.op === '%') return (x) => f(x) / 100;
        if (a.op === '!') return (x) => fact(f(x));
        return null;
      }
      case 'bin': {
        const f = build(a.a);
        const g = build(a.b);
        if (!f || !g) return null;
        switch (a.op) {
          case '+':
            return (x) => f(x) + g(x);
          case '-':
            return (x) => f(x) - g(x);
          case '×':
          case 'imul':
            return (x) => f(x) * g(x);
          case '÷':
            return (x) => f(x) / g(x);
          case '^': {
            if (a.a.k === 'id' && a.a.name === 'e') return (x) => Math.exp(g(x));
            return (x) => {
              const b = f(x);
              const e = g(x);
              if (b < 0 && Number.isInteger(e)) return Math.pow(b, e);
              if (b < 0 && Number.isInteger(1 / e) && Math.abs(1 / e) % 2 === 1) return -Math.pow(-b, e);
              return Math.pow(b, e);
            };
          }
          default:
            return null;
        }
      }
      case 'call': {
        const fs = a.args.map(build);
        if (fs.some((x) => !x) || fs.length < 1 || fs.length > 2) return null;
        if ((a.name === 'logb' || a.name === 'nthroot') !== (fs.length === 2)) return null;
        const f = fs[0] as Fn1;
        const g = fs[1] as Fn1;
        switch (a.name) {
          case 'sin':
            return f && ((x) => Math.sin(f(x) * k));
          case 'cos':
            return f && ((x) => Math.cos(f(x) * k));
          case 'tan':
            return f && ((x) => Math.tan(f(x) * k));
          case 'asin':
            return f && ((x) => Math.asin(f(x)) / k);
          case 'acos':
            return f && ((x) => Math.acos(f(x)) / k);
          case 'atan':
            return f && ((x) => Math.atan(f(x)) / k);
          case 'sinh':
            return f && ((x) => Math.sinh(f(x)));
          case 'cosh':
            return f && ((x) => Math.cosh(f(x)));
          case 'tanh':
            return f && ((x) => Math.tanh(f(x)));
          case 'asinh':
            return f && ((x) => Math.asinh(f(x)));
          case 'acosh':
            return f && ((x) => Math.acosh(f(x)));
          case 'atanh':
            return f && ((x) => Math.atanh(f(x)));
          case 'log':
            return f && ((x) => Math.log10(f(x)));
          case 'ln':
            return f && ((x) => Math.log(f(x)));
          case 'logb':
            return f && g && ((x) => Math.log(g(x)) / Math.log(f(x)));
          case 'sqrt':
            return f && ((x) => Math.sqrt(f(x)));
          case 'cbrt':
            return f && ((x) => Math.cbrt(f(x)));
          case 'nthroot':
            return (
              f &&
              g &&
              ((x) => {
                const n = f(x);
                const v = g(x);
                if (v < 0 && Number.isInteger(n) && n % 2 !== 0) return -Math.pow(-v, 1 / n);
                return Math.pow(v, 1 / n);
              })
            );
          case 'abs':
            return f && ((x) => Math.abs(f(x)));
          case 'Int':
            return f && ((x) => Math.trunc(f(x)));
          case 'Intg':
            return f && ((x) => Math.floor(f(x)));
          default:
            return null;
        }
      }
      default:
        return null;
    }
  };
  return build(ast);
}

// ------------------------------------------------------------------ adaptive Gauss–Kronrod (G7, K15)

/* Published Gauss–Kronrod nodes/weights are given with more digits than a double holds; the extra digits are harmless. */
/* eslint-disable no-loss-of-precision */
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926,
  0.741531185599394439863864773280788, 0.58608723546769113029414483825873, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0.0,
];
const WGK = [
  0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518,
  0.140653259715525918745189590510238, 0.16900472663926790282658342659855, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327];

/* eslint-enable no-loss-of-precision */

function gk15(f: Fn1, a: number, b: number): { value: number; err: number } {
  const c = 0.5 * (a + b);
  const h = 0.5 * (b - a);
  const fc = f(c);
  let resK = fc * WGK[7];
  let resG = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const f1 = f(c - dx);
    const f2 = f(c + dx);
    resK += WGK[j] * (f1 + f2);
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * (f1 + f2);
  }
  return { value: resK * h, err: Math.abs((resK - resG) * h) };
}

export function integrate(f: Fn1, a: number, b: number, tol = 1e-11, maxIntervals = 400): number {
  if (a === b) return 0;
  let sign = 1;
  if (a > b) {
    [a, b] = [b, a];
    sign = -1;
  }
  interface Seg {
    a: number;
    b: number;
    v: number;
    e: number;
  }
  // start with a few panels so periodic / symmetric integrands are not missed
  const n0 = 4;
  const segs: Seg[] = [];
  for (let i = 0; i < n0; i++) {
    const lo = a + ((b - a) * i) / n0;
    const hi = a + ((b - a) * (i + 1)) / n0;
    const r = gk15(f, lo, hi);
    segs.push({ a: lo, b: hi, v: r.value, e: r.err });
  }
  for (let iter = 0; iter < maxIntervals; iter++) {
    let total = 0;
    let errTotal = 0;
    let worst = 0;
    for (let i = 0; i < segs.length; i++) {
      total += segs[i].v;
      errTotal += segs[i].e;
      if (segs[i].e > segs[worst].e) worst = i;
    }
    if (!Number.isFinite(total)) return NaN;
    if (errTotal <= tol * Math.max(1, Math.abs(total)) * 1e-2 || errTotal <= 1e-15) break;
    const s = segs[worst];
    const m = 0.5 * (s.a + s.b);
    if (m === s.a || m === s.b) break;
    const l = gk15(f, s.a, m);
    const r = gk15(f, m, s.b);
    segs.splice(worst, 1, { a: s.a, b: m, v: l.value, e: l.err }, { a: m, b: s.b, v: r.value, e: r.err });
  }
  let total = 0;
  for (const s of segs) total += s.v;
  return sign * total;
}

// ------------------------------------------------------------------ derivative (Ridders' extrapolation)

export function derivative(f: Fn1, x: number): number {
  const CON = 1.4;
  const CON2 = CON * CON;
  const NTAB = 12;
  const SAFE = 2;
  let h = Math.max(Math.abs(x) * 1e-2, 1e-2);
  const a: number[][] = Array.from({ length: NTAB }, () => new Array<number>(NTAB).fill(0));
  a[0][0] = (f(x + h) - f(x - h)) / (2 * h);
  let err = Infinity;
  let ans = a[0][0];
  for (let i = 1; i < NTAB; i++) {
    h /= CON;
    a[0][i] = (f(x + h) - f(x - h)) / (2 * h);
    let fac = CON2;
    for (let j = 1; j <= i; j++) {
      a[j][i] = (a[j - 1][i] * fac - a[j - 1][i - 1]) / (fac - 1);
      fac *= CON2;
      const errt = Math.max(Math.abs(a[j][i] - a[j - 1][i]), Math.abs(a[j][i] - a[j - 1][i - 1]));
      if (errt <= err) {
        err = errt;
        ans = a[j][i];
      }
    }
    if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= SAFE * err) break;
  }
  return ans;
}
