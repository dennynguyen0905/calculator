// BASE-N mode: 32-bit signed integer arithmetic in Bin / Oct / Dec / Hex with logical operators.

import type { Ast } from '../ast';
import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { mathError, syntaxError } from '../errors';
import type { Val } from '../evaluator';
import { text, type RNode } from '../format/rnode';
import type { Slot } from '../items';
import * as N from '../num';
import { ExprPad, type PadResult } from '../pad';
import { parse } from '../parser';

export type Radix = 2 | 8 | 10 | 16;

const MAX = 2147483647n;
const MIN = -2147483648n;
const MOD = 1n << 32n;

const chk = (x: bigint): bigint => {
  if (x > MAX || x < MIN) throw mathError();
  return x;
};
const toU = (x: bigint): bigint => (x < 0n ? x + MOD : x);
const toS = (u: bigint): bigint => (u >= MOD / 2n ? u - MOD : u);

function literal(a: Extract<Ast, { k: 'num' }>): bigint {
  if (a.text.includes('.') || a.text.includes('⌟') || a.exp) throw syntaxError(a.pos);
  let v = 0n;
  const R = BigInt(a.radix);
  for (const ch of a.text) v = v * R + BigInt(parseInt(ch, 16));
  if (a.radix === 10) {
    if (v > MAX) throw mathError();
    return v;
  }
  if (v >= MOD) throw mathError();
  return toS(v);
}

export function evalBaseAst(a: Ast, ans: bigint, preAns: bigint): bigint {
  const ev = (x: Ast): bigint => evalBaseAst(x, ans, preAns);
  switch (a.k) {
    case 'num':
      return literal(a);
    case 'id':
      if (a.name === 'Ans') return ans;
      if (a.name === 'PreAns') return preAns;
      throw syntaxError(a.pos);
    case 'paren':
      return ev(a.a);
    case 'neg':
      // -2147483648 is representable although +2147483648 is not
      if (a.a.k === 'num' && a.a.radix === 10 && a.a.text === '2147483648') return MIN;
      return chk(-ev(a.a));
    case 'bin': {
      const l = ev(a.a);
      const r = ev(a.b);
      switch (a.op) {
        case '+':
          return chk(l + r);
        case '-':
          return chk(l - r);
        case '×':
        case 'imul':
          return chk(l * r);
        case '÷':
          if (r === 0n) throw mathError();
          return chk(l / r);
        case 'and':
          return toS(toU(l) & toU(r));
        case 'or':
          return toS(toU(l) | toU(r));
        case 'xor':
          return toS(toU(l) ^ toU(r));
        case 'xnor':
          return toS(~(toU(l) ^ toU(r)) & (MOD - 1n));
        default:
          throw syntaxError();
      }
    }
    case 'call':
      if (a.args.length !== 1) throw syntaxError();
      if (a.name === 'Not') return toS(~toU(ev(a.args[0])) & (MOD - 1n));
      if (a.name === 'NegB') return chk(-ev(a.args[0]));
      throw syntaxError();
    default:
      throw syntaxError();
  }
}

export function toRadixString(x: bigint, radix: Radix): string {
  if (radix === 10) return x.toString();
  return toU(x).toString(radix).toUpperCase();
}

const RADIX_NAME: Record<Radix, string> = { 2: 'BIN', 8: 'OCT', 10: 'DEC', 16: 'HEX' };
const BASE_MENU = ['d', 'h', 'b', 'o', 'Neg(', 'Not(', 'and', 'or', 'xor', 'xnor'];
const BLOCKED = new Set(['.', 'exp10', 'pi', 'e', 'i', 'frac', 'mixed', 'sqrt', 'cbrt', 'root', 'cube', 'inv', 'fact', 'abs', 'pow10', 'powe', 'integ', 'deriv', 'sigma', 'logb', 'dms', 'calc', 'solve']);

export class BaseController implements ModeController {
  radix: Radix = 10;
  readonly pad: ExprPad;
  constructor(private readonly calc: Calculator) {
    const toBig = (v: Val): bigint => {
      const n = v.t === 'x' || v.t === 'a' ? N.toBigInt(v) : null;
      return n ?? 0n;
    };
    this.pad = new ExprPad(calc, {
      allowCalc: false,
      evalFn: (items: Slot): Val => {
        const ast = parse(items, this.radix, true);
        return N.fromInt(evalBaseAst(ast, toBig(calc.ctx.ans), toBig(calc.ctx.preAns)));
      },
      format: (r: PadResult) => {
        const n = r.val.t === 'x' || r.val.t === 'a' ? N.toBigInt(r.val) : null;
        const lines: RNode[] = [text(n === null ? '' : toRadixString(n, this.radix))];
        return { lines, canToggle: false, exactShown: true };
      },
    });
  }

  handle(cmd: string): boolean {
    switch (cmd) {
      case 'sq':
        this.radix = 10;
        return true;
      case 'pow':
        this.radix = 16;
        return true;
      case 'log':
        this.radix = 2;
        return true;
      case 'ln':
        this.radix = 8;
        return true;
      case 'base':
        this.calc.openMenu({
          title: 'BASE',
          items: BASE_MENU.map((l, i) => ({ label: `${(i + 1) % 10}:${l}` })),
          sel: 0,
          digits: 'index',
          pick: (i) => this.pad.handle(`tok:${BASE_MENU[i]}`),
        });
        return true;
      default:
        break;
    }
    // restrict digits / letters to the current base
    if (/^[0-9]$/.test(cmd) && Number(cmd) >= this.radix && this.radix !== 16) return true;
    if (BLOCKED.has(cmd)) return true;
    return this.pad.handle(cmd);
  }

  currentValue(): Val | null {
    return this.pad.evalCurrent();
  }

  screen(): ModeScreen {
    const r = this.pad.rows();
    return { rows: r.rows, cursorRow: r.cursorRow, status: { mode: RADIX_NAME[this.radix], up: this.pad.hist.length > 0, down: this.pad.histPos >= 0, overwrite: !this.pad.ed.insert } };
  }

  serialize(): unknown {
    return { radix: this.radix, pad: this.pad.serialize() };
  }
  restore(j: unknown): void {
    const o = j as { radix?: Radix; pad?: unknown };
    if (o?.radix && [2, 8, 10, 16].includes(o.radix)) this.radix = o.radix;
    if (o?.pad) this.pad.restore(o.pad);
  }
}

registerMode('BASE', (c) => new BaseController(c));
