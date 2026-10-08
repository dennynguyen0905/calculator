// AST evaluator for COMP / CMPLX / MATRIX / VECTOR style expressions.

import type { Ast } from './ast';
import * as C from './complex';
import { CONSTANTS, constFromId, constantValue, convert } from './constants';
import { D } from './dec';
import { CalcError, argError, mathError, syntaxError } from './errors';
import { compileFast, derivative, integrate, type Fn1 } from './fast';
import type { Slot } from './items';
import * as F from './mathfn';
import type { AngleUnit } from './mathfn';
import * as M from './matrix';
import * as N from './num';
import type { Num } from './num';
import { parse } from './parser';
import { Q } from './rational';

export interface QRVal {
  readonly t: 'qr';
  readonly q: Num;
  readonly r: Num;
}
export interface PFVal {
  readonly t: 'pf';
  readonly n: bigint;
}
export interface MultiVal {
  readonly t: 'multi';
  readonly items: readonly { label: string; v: Val }[];
}
export type Val = Num | C.CxVal | M.MatVal | QRVal | PFVal | MultiVal;

export interface EvalCtx {
  angle: AngleUnit;
  /** CMPLX mode: complex results allowed, `i` available */
  complex: boolean;
  vars: Record<string, Val>;
  ans: Val;
  preAns: Val;
  rng: () => number;
  /** Rnd( – rounds to the current display digits */
  round?: (n: Num) => Num;
  /** extra identifiers (statistics variables, matrices ...) */
  lookup?: (name: string) => Val | undefined;
  /** extra functions: return undefined if unknown */
  extraFn?: (name: string, args: Val[], ctx: EvalCtx) => Val | undefined;
  /** statistics: P(, Q(, R(, t( */
  statDist?: (name: string, x: Num) => Num;
}

export function makeCtx(over: Partial<EvalCtx> = {}): EvalCtx {
  return {
    angle: 'deg',
    complex: false,
    vars: {},
    ans: N.ZERO,
    preAns: N.ZERO,
    rng: Math.random,
    ...over,
  };
}

// ---------------------------------------------------------------- helpers

function scalar(v: Val): C.Scalar {
  if (v.t === 'x' || v.t === 'a' || v.t === 'c') return v;
  if (v.t === 'm') throw new CalcError('Dimension');
  throw mathError();
}
function real(v: Val, _ctx: EvalCtx): Num {
  const s = scalar(v);
  if (C.isCx(s)) throw mathError();
  return s;
}

const E_NUM = (): Num => N.na(new D(1).exp());
const LN10 = (): Num => N.na(new D(10).ln());

export function literal(a: Extract<Ast, { k: 'num' }>, ctx: EvalCtx): Num {
  if (a.radix !== 10) {
    return N.fromInt(bigFromRadix(a.text, a.radix));
  }
  const t = a.text;
  if (t.includes('⌟')) return fractionLiteral(t, a.pos);
  if ((t.match(/\./g) ?? []).length > 1 || t === '.') throw syntaxError(a.pos);
  let q: Q;
  try {
    q = Q.parseDecimal(t);
  } catch {
    throw syntaxError(a.pos);
  }
  const hasDot = t.includes('.');
  let n: Num = N.fromQ(q, hasDot);
  if (a.exp) {
    const e = real(ev(a.exp, ctx), ctx);
    const ei = N.toBigInt(e);
    if (ei === null) throw syntaxError(a.pos);
    if (ei > 99n || ei < -99n) {
      if (ei > 0n && !N.isZero(n)) throw mathError();
      return N.withDecFlag(N.ZERO, true);
    }
    n = N.withDecFlag(N.mul(n, N.pow(N.fromInt(10), N.fromInt(ei))), true);
  }
  return n;
}

/** line-display fraction literal  a⌟b  or  w⌟a⌟b */
function fractionLiteral(t: string, pos: number): Num {
  const parts = t.split('⌟');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) throw syntaxError(pos);
  const [w, n, d] = parts.length === 3 ? parts : ['0', parts[0], parts[1]];
  if (BigInt(d) === 0n) throw mathError();
  return N.fromQ(Q.of(BigInt(w) * BigInt(d) + BigInt(n), BigInt(d)));
}

function bigFromRadix(text: string, radix: number): bigint {
  let r = 0n;
  const R = BigInt(radix);
  for (const ch of text) r = r * R + BigInt(parseInt(ch, 16));
  return r;
}

function idValue(name: string, ctx: EvalCtx): Val {
  switch (name) {
    case 'π':
      return N.PI;
    case 'e':
      return E_NUM();
    case 'i':
      if (!ctx.complex) throw syntaxError();
      return C.I;
    case 'Ans':
      return ctx.ans;
    case 'PreAns':
      return ctx.preAns;
    case 'Ran#':
      return N.fromQ(Q.of(Math.floor(ctx.rng() * 1000), 1000), true);
  }
  const cn = constFromId(name);
  if (cn !== null) return constantValue(cn)!;
  if (/^[A-FXYM]$/.test(name)) return ctx.vars[name] ?? N.ZERO;
  const ext = ctx.lookup?.(name);
  if (ext !== undefined) return ext;
  throw syntaxError();
}

// ---------------------------------------------------------------- main evaluator

export function ev(a: Ast, ctx: EvalCtx): Val {
  switch (a.k) {
    case 'num':
      return literal(a, ctx);
    case 'id':
      return idValue(a.name, ctx);
    case 'paren':
      return ev(a.a, ctx);
    case 'neg': {
      const v = ev(a.a, ctx);
      if (M.isMat(v)) return M.map(v, N.neg);
      return C.cNeg(scalar(v));
    }
    case 'bin':
      return binary(a, ctx);
    case 'post':
      return postfix(a, ctx);
    case 'call':
      return callFn(a.name, a.args.map((x) => ev(x, ctx)), ctx, a);
    case 'dms': {
      const z = N.ZERO;
      const part = (x: Ast | undefined, div: number): Num =>
        x ? N.div(real(ev(x, ctx), ctx), N.fromInt(div)) : z;
      const deg = part(a.deg, 1);
      const sum = N.add(N.add(deg, part(a.min, 60)), part(a.sec, 3600));
      const conv = F.fromDegrees(sum, ctx.angle);
      return a.min || a.sec ? N.asDec(conv) : conv;
    }
    case 'sigma':
      return sigma(a, ctx);
    case 'integ':
      return integral(a, ctx);
    case 'deriv':
      return deriv(a, ctx);
    case 'convert': {
      const r = convert(a.code, real(ev(a.a, ctx), ctx));
      if (!r) throw argError();
      return r;
    }
  }
}

function binary(a: Extract<Ast, { k: 'bin' }>, ctx: EvalCtx): Val {
  const op = a.op;
  // e^x is computed directly for full precision
  if (op === '^' && a.a.k === 'id' && a.a.name === 'e') {
    const x = scalar(ev(a.b, ctx));
    return C.cExp(x);
  }
  const l = ev(a.a, ctx);
  const r = ev(a.b, ctx);
  switch (op) {
    case '+':
      if (M.isMat(l) && M.isMat(r)) return M.add(l, r);
      if (M.isMat(l) || M.isMat(r)) throw new CalcError('Dimension');
      return C.cAdd(scalar(l), scalar(r));
    case '-':
      if (M.isMat(l) && M.isMat(r)) return M.sub(l, r);
      if (M.isMat(l) || M.isMat(r)) throw new CalcError('Dimension');
      return C.cSub(scalar(l), scalar(r));
    case '×':
    case 'imul':
      if (M.isMat(l) && M.isMat(r)) {
        if (l.vec && r.vec) return M.cross(l, r);
        return M.mul(l, r);
      }
      if (M.isMat(l)) return M.scale(l, real(r, ctx));
      if (M.isMat(r)) return M.scale(r, real(l, ctx));
      return C.cMul(scalar(l), scalar(r));
    case '÷':
      if (M.isMat(l) && !M.isMat(r)) return M.map(l, (x) => N.div(x, real(r, ctx)));
      if (M.isMat(l) || M.isMat(r)) throw new CalcError('Dimension');
      return C.cDiv(scalar(l), scalar(r));
    case '^':
      if (M.isMat(l)) {
        const k = N.toBigInt(real(r, ctx));
        if (k === null || k > 100n || k < -100n) throw mathError();
        return M.powInt(l, Number(k));
      }
      if (M.isMat(r)) throw new CalcError('Dimension');
      if (ctx.complex) return C.cPow(scalar(l), scalar(r));
      return N.pow(real(l, ctx), real(r, ctx));
    case 'nPr':
      return F.nPr(real(l, ctx), real(r, ctx));
    case 'nCr':
      return F.nCr(real(l, ctx), real(r, ctx));
    case '∠':
      if (!ctx.complex) throw syntaxError();
      return C.fromPolar(real(l, ctx), real(r, ctx), ctx.angle);
    case '·':
      if (M.isMat(l) && M.isMat(r)) return M.dot(l, r);
      throw new CalcError('Dimension');
    case '÷R': {
      const [q, rem] = F.divRem(real(l, ctx), real(r, ctx));
      return { t: 'qr', q, r: rem };
    }
    default:
      throw syntaxError();
  }
}

function postfix(a: Extract<Ast, { k: 'post' }>, ctx: EvalCtx): Val {
  const v = ev(a.a, ctx);
  switch (a.op) {
    case '!':
      return F.factorial(real(v, ctx));
    case '%':
      return F.percent(real(v, ctx));
    case 'ʳ':
      return unitConv(real(v, ctx), 'rad', ctx.angle);
    case 'ᵍ':
      return unitConv(real(v, ctx), 'gra', ctx.angle);
    default:
      throw syntaxError();
  }
}

function unitConv(x: Num, from: AngleUnit, to: AngleUnit): Num {
  if (from === to) return x;
  // via degrees
  let deg: Num;
  if (from === 'rad') deg = N.mul(x, N.nx([{ p: -1, r: 1n, c: Q.of(180) }]));
  else if (from === 'gra') deg = N.mul(x, N.fromQ(Q.of(9, 10)));
  else deg = x;
  return F.fromDegrees(deg, to);
}

// ---------------------------------------------------------------- functions

function expectArgs(args: Val[], min: number, max = min): void {
  if (args.length === 0) throw syntaxError();
  if (args.length < min || args.length > max) throw argError();
}

export function callFn(name: string, args: Val[], ctx: EvalCtx, node?: Ast): Val {
  const ext = ctx.extraFn?.(name, args, ctx);
  if (ext !== undefined) return ext;
  const u = ctx.angle;
  const cx = ctx.complex;
  const arg1 = (): C.Scalar => {
    expectArgs(args, 1);
    return scalar(args[0]);
  };
  const r1 = (): Num => {
    expectArgs(args, 1);
    return real(args[0], ctx);
  };
  const r2 = (): [Num, Num] => {
    expectArgs(args, 2);
    return [real(args[0], ctx), real(args[1], ctx)];
  };
  switch (name) {
    case 'sin':
      return cx ? C.cSin(arg1(), u) : F.sin(r1(), u);
    case 'cos':
      return cx ? C.cCos(arg1(), u) : F.cos(r1(), u);
    case 'tan':
      return cx ? C.cTan(arg1(), u) : F.tan(r1(), u);
    case 'asin':
      return cx ? C.cAsin(arg1(), u) : F.asin(r1(), u);
    case 'acos':
      return cx ? C.cAcos(arg1(), u) : F.acos(r1(), u);
    case 'atan':
      return cx ? C.cAtan(arg1(), u) : F.atan(r1(), u);
    case 'sinh':
      return cx ? C.cSinh(arg1()) : F.sinh(r1());
    case 'cosh':
      return cx ? C.cCosh(arg1()) : F.cosh(r1());
    case 'tanh':
      return cx ? C.cTanh(arg1()) : F.tanh(r1());
    case 'asinh':
      return F.asinh(r1());
    case 'acosh':
      return F.acosh(r1());
    case 'atanh':
      return F.atanh(r1());
    case 'log':
      if (args.length === 2) {
        const [b, x] = r2();
        return F.logBase(b, x);
      }
      if (cx) {
        const x = arg1();
        if (!C.isCx(x) && N.sign(x) > 0) return F.log10(x);
        return C.cDiv(C.cLn(x), LN10());
      }
      return F.log10(r1());
    case 'ln':
      return cx ? C.cLn(arg1()) : F.ln(r1());
    case 'logb': {
      const [b, x] = r2();
      return F.logBase(b, x);
    }
    case 'sqrt':
      return cx ? C.cSqrt(arg1()) : N.sqrt(r1());
    case 'cbrt':
      return cx ? C.cPow(arg1(), N.fromQ(Q.of(1, 3))) : F.cbrt(r1());
    case 'nthroot': {
      const [n, x] = r2();
      if (cx && N.sign(x) < 0) return C.cPow(x, N.div(N.ONE, n));
      return F.nthRoot(n, x);
    }
    case 'abs': {
      expectArgs(args, 1);
      const v = args[0];
      if (M.isMat(v)) return v.vec ? M.norm(v) : M.map(v, N.abs);
      return C.cAbs(scalar(v));
    }
    case 'Pol': {
      const [x, y] = r2();
      const rr = N.sqrt(N.add(N.mul(x, x), N.mul(y, y)));
      const th = F.atan2(y, x, u);
      ctx.vars.X = rr;
      ctx.vars.Y = th;
      return {
        t: 'multi',
        items: [
          { label: 'r', v: rr },
          { label: 'θ', v: th },
        ],
      };
    }
    case 'Rec': {
      const [rr, th] = r2();
      const x = N.mul(rr, F.cos(th, u));
      const y = N.mul(rr, F.sin(th, u));
      ctx.vars.X = x;
      ctx.vars.Y = y;
      return {
        t: 'multi',
        items: [
          { label: 'x', v: x },
          { label: 'y', v: y },
        ],
      };
    }
    case 'RanInt': {
      const [lo, hi] = r2();
      const a = N.toBigInt(lo);
      const b = N.toBigInt(hi);
      if (a === null || b === null || a > b) throw argError();
      const span = Number(b - a) + 1;
      return N.fromInt(a + BigInt(Math.floor(ctx.rng() * span)));
    }
    case 'Rnd':
      return ctx.round ? ctx.round(r1()) : r1();
    case 'GCD': {
      const [a, b] = r2();
      return F.gcdNum(a, b);
    }
    case 'LCM': {
      const [a, b] = r2();
      return F.lcmNum(a, b);
    }
    case 'Int':
      return F.intPart(r1());
    case 'Intg':
      return F.intg(r1());
    case 'Rem': {
      const [a, b] = r2();
      return F.divRem(a, b)[1];
    }
    case 'Quotient': {
      const [a, b] = r2();
      return F.divRem(a, b)[0];
    }
    case 'Fact': {
      const n = N.toBigInt(r1());
      if (n === null || n < 2n || n > 9_999_999_999n) throw mathError();
      return { t: 'pf', n };
    }
    case 'Conjg':
      return C.cConj(arg1());
    case 'Arg':
      return C.cArg(arg1(), u);
    case 'ReP':
      return C.reOf(arg1());
    case 'ImP':
      return C.imOf(arg1());
    case 'Const': {
      const n = N.toBigInt(r1());
      const v = n === null ? null : constantValue(Number(n));
      if (!v) throw argError();
      return v;
    }
    case 'det': {
      expectArgs(args, 1);
      const m = args[0];
      if (!M.isMat(m)) throw new CalcError('Dimension');
      return M.det(m);
    }
    case 'Trn': {
      expectArgs(args, 1);
      const m = args[0];
      if (!M.isMat(m)) throw new CalcError('Dimension');
      return M.trn(m);
    }
    case 'Ident': {
      const n = N.toBigInt(r1());
      if (n === null || n < 1n || n > 4n) throw argError();
      return M.identity(Number(n));
    }
    case 'Angle': {
      expectArgs(args, 2);
      const [x, y] = args;
      if (!M.isMat(x) || !M.isMat(y)) throw new CalcError('Dimension');
      const d = M.dot(x, y);
      const den = N.mul(M.norm(x), M.norm(y));
      if (N.isZero(den)) throw mathError();
      return F.acos(N.div(d, den), u);
    }
    case 'UnitV': {
      expectArgs(args, 1);
      const x = args[0];
      if (!M.isMat(x)) throw new CalcError('Dimension');
      return M.unit(x);
    }
    case 'P':
    case 'Qf':
    case 'R':
    case 't':
      if (!ctx.statDist) throw syntaxError();
      return ctx.statDist(name, r1());
    default:
      throw syntaxError();
  }
  void node;
}

// ---------------------------------------------------------------- Σ, ∫, d/dx

function withX<T>(ctx: EvalCtx, x: Val, f: () => T): T {
  const saved = ctx.vars.X;
  ctx.vars.X = x;
  try {
    return f();
  } finally {
    if (saved === undefined) delete ctx.vars.X;
    else ctx.vars.X = saved;
  }
}

function sigma(a: Extract<Ast, { k: 'sigma' }>, ctx: EvalCtx): Val {
  const lo = N.toBigInt(real(ev(a.lo, ctx), ctx));
  const hi = N.toBigInt(real(ev(a.hi, ctx), ctx));
  if (lo === null || hi === null || lo > hi || hi - lo > 1_000_000n) throw argError();
  let sum: C.Scalar = N.ZERO;
  const t0 = Date.now();
  let count = 0;
  for (let k = lo; k <= hi; k++) {
    if (++count % 256 === 0 && Date.now() - t0 > 8000) throw new CalcError('Time Out');
    const term = withX(ctx, N.fromInt(k), () => scalar(ev(a.body, ctx)));
    sum = C.cAdd(sum, term);
  }
  return sum;
}

function fastEnv(ctx: EvalCtx) {
  return {
    angle: ctx.angle,
    varValue: (name: string): number | undefined => {
      let v: Val | undefined;
      if (name === 'Ans') v = ctx.ans;
      else if (/^[A-FYM]$/.test(name)) v = ctx.vars[name] ?? N.ZERO;
      else return undefined;
      return N.isExact(v as Num) || (v as Num).t === 'a' ? N.toNumber(v as Num) : undefined;
    },
  };
}

/** a numeric function of x for the integrand / derivative body; fast double path, exact evaluator fallback */
function numericFn(body: Ast, ctx: EvalCtx): Fn1 {
  const fast = compileFast(body, fastEnv(ctx));
  if (fast) return fast;
  return (x: number) => {
    const xv = N.na(new D(x));
    return withX(ctx, xv, () => N.toNumber(real(ev(body, ctx), ctx)));
  };
}

function integral(a: Extract<Ast, { k: 'integ' }>, ctx: EvalCtx): Val {
  const lo = N.toNumber(real(ev(a.lo, ctx), ctx));
  const hi = N.toNumber(real(ev(a.hi, ctx), ctx));
  const f = numericFn(a.body, ctx);
  const v = integrate(f, lo, hi);
  if (!Number.isFinite(v)) throw mathError();
  return N.na(new D(v));
}

function deriv(a: Extract<Ast, { k: 'deriv' }>, ctx: EvalCtx): Val {
  const x0 = N.toNumber(real(ev(a.at, ctx), ctx));
  const f = numericFn(a.body, ctx);
  const v = derivative(f, x0);
  if (!Number.isFinite(v)) throw mathError();
  return N.na(new D(v));
}

// ---------------------------------------------------------------- entry points

export function evalItems(items: Slot, ctx: EvalCtx): Val {
  return ev(parse(items, 10), ctx);
}

export { CONSTANTS };
