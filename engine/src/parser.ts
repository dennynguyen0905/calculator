// Lexer (editor items -> tokens) and recursive-descent parser with the fx-580VN X priority sequence:
//   ( ) > functions with argument > postfix (x², x!, %, ^, DMS) > prefix minus > implicit multiplication
//   > nPr nCr ∠ > · > × ÷ ÷R > + − > and > or xor xnor

import type { Ast } from './ast';
import type { Item, Slot } from './items';
import { CalcError, stackError, syntaxError } from './errors';

// ------------------------------------------------------------------ lexicon

/** function key lexeme -> canonical name */
export const FN_LEXEMES: Record<string, string> = {
  'sin(': 'sin',
  'cos(': 'cos',
  'tan(': 'tan',
  'sin⁻¹(': 'asin',
  'cos⁻¹(': 'acos',
  'tan⁻¹(': 'atan',
  'asin(': 'asin',
  'acos(': 'acos',
  'atan(': 'atan',
  'sinh(': 'sinh',
  'cosh(': 'cosh',
  'tanh(': 'tanh',
  'sinh⁻¹(': 'asinh',
  'cosh⁻¹(': 'acosh',
  'tanh⁻¹(': 'atanh',
  'asinh(': 'asinh',
  'acosh(': 'acosh',
  'atanh(': 'atanh',
  'log(': 'log',
  'ln(': 'ln',
  '√(': 'sqrt',
  '³√(': 'cbrt',
  'Abs(': 'abs',
  'Pol(': 'Pol',
  'Rec(': 'Rec',
  'RanInt#(': 'RanInt',
  'Rnd(': 'Rnd',
  'GCD(': 'GCD',
  'LCM(': 'LCM',
  'Int(': 'Int',
  'Intg(': 'Intg',
  'Rem(': 'Rem',
  'Quotient(': 'Quotient',
  'Conjg(': 'Conjg',
  'Arg(': 'Arg',
  'ReP(': 'ReP',
  'ImP(': 'ImP',
  'Not(': 'Not',
  'Neg(': 'NegB',
  'det(': 'det',
  'Trn(': 'Trn',
  'Ident(': 'Ident',
  'Dim(': 'Dim',
  'Norm(': 'Norm',
  'Angle(': 'Angle',
  'UnitV(': 'UnitV',
  'P(': 'P',
  'Q(': 'Qf',
  'R(': 'R',
  't(': 't',
  'Conv(': 'Conv',
  'Const(': 'Const',
  'Fact(': 'Fact',
  'Mat(': 'Mat',
  'Vct(': 'Vct',
  'Cal(': 'Cal',
  'logb(': 'logb',
  'x̂(': 'xhat',
  'x̂1(': 'xhat1',
  'x̂2(': 'xhat2',
  'ŷ(': 'yhat',
  'SUM(': 'SUM',
  'MEAN(': 'MEAN',
  'MAX(': 'MAX',
  'MIN(': 'MIN',
  'COUNT(': 'COUNT',
};

export const OP_LEXEMES = new Set([
  '+',
  '-',
  '×',
  '÷',
  '^',
  'nPr',
  'nCr',
  '∠',
  '·',
  '÷R',
  'and',
  'or',
  'xor',
  'xnor',
  '!',
  '%',
  '°',
  'ʳ',
  'ᵍ',
  '′',
  '″',
  '²',
  '³',
  '⁻¹',
  'ʸ√',
  '=',
]);

const OP_ALIASES: Record<string, string> = { '−': '-', '*': '×', '/': '÷', '⁻': '-', '–': '-' };

export type Tok =
  | { t: 'num'; text: string; exp?: Slot; pos: number; radix?: number }
  | { t: 'id'; s: string; pos: number }
  | { t: 'fn'; s: string; pos: number }
  | { t: 'op'; s: string; pos: number }
  | { t: 'lp' | 'rp' | 'comma'; pos: number }
  | { t: 'item'; item: Item; pos: number };

function isDigitChar(s: string, radix: number): boolean {
  if (s.length !== 1) return false;
  if (s === '.' || s === '⌟') return radix === 10;
  const v = parseInt(s, 16);
  if (Number.isNaN(v)) return false;
  if (radix === 16) return /[0-9A-F]/.test(s);
  return /[0-9]/.test(s) && v < radix;
}

export function lex(items: Slot, radix = 10, baseMode = false): Tok[] {
  const out: Tok[] = [];
  let markRadix: number | undefined; // d/h/b/o prefix applying to the next literal
  let open: Extract<Tok, { t: 'num' }> | null = null; // number literal still accepting digits
  let expOf: Extract<Tok, { t: 'num' }> | null = null; // literal currently collecting an "E" exponent
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.k === 'c') {
      const s = OP_ALIASES[it.s] ?? it.s;
      if (expOf) {
        if (/^[0-9]$/.test(s) || (s === '-' && expOf.exp!.length === 0)) {
          expOf.exp!.push(it.s === '−' ? { k: 'c', s: '-' } : it);
          continue;
        }
        expOf = null;
      }
      if (s === 'E' && radix === 10 && open) {
        expOf = open;
        open.exp = [];
        open = null;
        continue;
      }
      if (baseMode && (s === 'd' || s === 'h' || s === 'b' || s === 'o')) {
        open = null;
        markRadix = s === 'd' ? 10 : s === 'h' ? 16 : s === 'b' ? 2 : 8;
        continue;
      }
      if (isDigitChar(s, open?.radix ?? markRadix ?? radix)) {
        if (open) open.text += s;
        else {
          open = { t: 'num', text: s, pos: i, radix: markRadix };
          markRadix = undefined;
          out.push(open);
        }
        continue;
      }
      open = null;
      markRadix = undefined;
      if (s === '(') out.push({ t: 'lp', pos: i });
      else if (s === ')') out.push({ t: 'rp', pos: i });
      else if (s === ',') out.push({ t: 'comma', pos: i });
      else if (FN_LEXEMES[s]) out.push({ t: 'fn', s: FN_LEXEMES[s], pos: i });
      else if (OP_LEXEMES.has(s)) out.push({ t: 'op', s, pos: i });
      else out.push({ t: 'id', s, pos: i });
    } else if (it.k === 'e10') {
      const prev = out[out.length - 1];
      if (open && prev === open && !open.exp) open.exp = it.e;
      else {
        open = { t: 'num', text: '1', exp: it.e, pos: i };
        out.push(open);
      }
      open = null;
    } else {
      open = null;
      out.push({ t: 'item', item: it, pos: i });
    }
  }
  return out;
}

// ------------------------------------------------------------------ parser

class Parser {
  i = 0;
  constructor(
    private readonly toks: Tok[],
    private readonly radix: number,
    private readonly depth: number,
    private readonly baseMode = false,
  ) {}

  private peek(o = 0): Tok | undefined {
    return this.toks[this.i + o];
  }
  private pos(): number {
    return this.toks[this.i]?.pos ?? (this.toks[this.toks.length - 1]?.pos ?? 0);
  }
  private fail(): never {
    throw syntaxError(this.pos());
  }
  private isOp(s: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === 'op' && t.s === s;
  }

  parseAll(): Ast {
    if (this.toks.length === 0) throw syntaxError(0);
    const a = this.parseOr();
    if (this.i < this.toks.length) this.fail();
    return a;
  }

  /** expression with an optional top-level "=" (CALC / SOLVE equations) */
  parseEquation(): Ast {
    if (this.toks.length === 0) throw syntaxError(0);
    const a = this.parseOr();
    if (this.isOp('=')) {
      this.i++;
      const b = this.parseOr();
      if (this.i < this.toks.length) this.fail();
      return { k: 'bin', op: '=', a, b };
    }
    if (this.i < this.toks.length) this.fail();
    return a;
  }

  private parseOr(): Ast {
    let a = this.parseAnd();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && (t.s === 'or' || t.s === 'xor' || t.s === 'xnor')) {
        this.i++;
        a = { k: 'bin', op: t.s, a, b: this.parseAnd() };
      } else return a;
    }
  }
  private parseAnd(): Ast {
    let a = this.parseAdd();
    while (this.isOp('and')) {
      this.i++;
      a = { k: 'bin', op: 'and', a, b: this.parseAdd() };
    }
    return a;
  }
  private parseAdd(): Ast {
    let a = this.parseMul();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && (t.s === '+' || t.s === '-')) {
        this.i++;
        a = { k: 'bin', op: t.s, a, b: this.parseMul() };
      } else return a;
    }
  }
  private parseMul(): Ast {
    let a = this.parseDot();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && (t.s === '×' || t.s === '÷' || t.s === '÷R')) {
        this.i++;
        a = { k: 'bin', op: t.s, a, b: this.parseDot() };
      } else return a;
    }
  }
  private parseDot(): Ast {
    let a = this.parsePerm();
    while (this.isOp('·')) {
      this.i++;
      a = { k: 'bin', op: '·', a, b: this.parsePerm() };
    }
    return a;
  }
  private parsePerm(): Ast {
    let a = this.parseImplicit();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && (t.s === 'nPr' || t.s === 'nCr' || t.s === '∠')) {
        this.i++;
        a = { k: 'bin', op: t.s, a, b: this.parseImplicit() };
      } else return a;
    }
  }

  private startsPrimary(t: Tok | undefined): boolean {
    if (!t) return false;
    switch (t.t) {
      case 'num':
      case 'id':
      case 'lp':
        return true;
      case 'fn':
        return t.s !== 'Conv';
      case 'item':
        return t.item.k !== 'pow' && t.item.k !== 'e10';
      default:
        return false;
    }
  }

  private parseImplicit(): Ast {
    let a = this.parseUnary();
    while (this.startsPrimary(this.peek())) {
      const b = this.parsePower();
      a = { k: 'bin', op: 'imul', a, b };
    }
    return a;
  }

  private parseUnary(): Ast {
    const t = this.peek();
    if (t && t.t === 'op' && t.s === '-') {
      this.i++;
      return { k: 'neg', a: this.parseUnary() };
    }
    if (t && t.t === 'op' && t.s === '+') {
      this.i++;
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): Ast {
    const base = this.parsePostfix(this.parsePrimary());
    if (this.isOp('ʸ√')) {
      this.i++;
      const rad = this.parsePostfix(this.parsePrimary());
      return { k: 'call', name: 'nthroot', args: [base, rad] };
    }
    if (this.isOp('^')) {
      this.i++;
      return { k: 'bin', op: '^', a: base, b: this.parseExpOperand() };
    }
    return base;
  }
  private parseExpOperand(): Ast {
    const t = this.peek();
    if (t && t.t === 'op' && t.s === '-') {
      this.i++;
      return { k: 'neg', a: this.parseExpOperand() };
    }
    if (t && t.t === 'op' && t.s === '+') {
      this.i++;
      return this.parseExpOperand();
    }
    return this.parsePower();
  }

  private parseSub(slot: Slot): Ast {
    if (slot.length === 0) throw syntaxError(this.pos());
    const toks = lex(slot, this.radix, this.baseMode);
    return new Parser(toks, this.radix, this.depth + 1, this.baseMode).parseAll();
  }

  private dmsNumber(): Ast | null {
    const t = this.peek();
    if (t && t.t === 'num') {
      this.i++;
      return this.numAst(t);
    }
    return null;
  }

  private parsePostfix(node: Ast): Ast {
    for (;;) {
      const t = this.peek();
      if (!t) return node;
      if (t.t === 'item' && t.item.k === 'pow') {
        this.i++;
        node = { k: 'bin', op: '^', a: node, b: this.parseSub(t.item.e) };
        continue;
      }
      if (t.t === 'fn' && t.s === 'Conv') {
        this.i++;
        const args = this.parseArgs();
        const code = args[0];
        if (args.length !== 1 || code.k !== 'num') throw syntaxError(t.pos);
        node = { k: 'convert', code: Number(code.text), a: node };
        continue;
      }
      if (t.t !== 'op') return node;
      switch (t.s) {
        case '!':
        case '%':
        case 'ʳ':
        case 'ᵍ':
          this.i++;
          node = { k: 'post', op: t.s, a: node };
          continue;
        case '²':
        case '³':
        case '⁻¹':
          this.i++;
          node = { k: 'bin', op: '^', a: node, b: { k: 'num', text: t.s === '²' ? '2' : t.s === '³' ? '3' : '1', radix: 10, pos: t.pos } };
          if (t.s === '⁻¹') node = { k: 'bin', op: '^', a: (node as Extract<Ast, { k: 'bin' }>).a, b: { k: 'neg', a: { k: 'num', text: '1', radix: 10, pos: t.pos } } };
          continue;
        case '°': {
          this.i++;
          const d: Ast = { k: 'dms', deg: node };
          // optional minutes / seconds:  30′ 15″
          if (this.peek()?.t === 'num' && this.isOp('′', 1)) {
            d.min = this.dmsNumber()!;
            this.i++;
            if (this.peek()?.t === 'num' && this.isOp('″', 1)) {
              d.sec = this.dmsNumber()!;
              this.i++;
            }
          } else if (this.peek()?.t === 'num' && this.isOp('″', 1)) {
            d.sec = this.dmsNumber()!;
            this.i++;
          }
          node = d;
          continue;
        }
        case '′': {
          this.i++;
          const d: Ast = { k: 'dms', min: node };
          if (this.peek()?.t === 'num' && this.isOp('″', 1)) {
            d.sec = this.dmsNumber()!;
            this.i++;
          }
          node = d;
          continue;
        }
        case '″':
          this.i++;
          node = { k: 'dms', sec: node };
          continue;
        default:
          return node;
      }
    }
  }

  private numAst(t: Extract<Tok, { t: 'num' }>): Ast {
    const ast: Ast = { k: 'num', text: t.text, radix: t.radix ?? this.radix, pos: t.pos };
    if (t.exp) ast.exp = this.parseSub(t.exp);
    return ast;
  }

  /** parse comma separated arguments until ')' (or end of input = auto-close) */
  private parseArgs(): Ast[] {
    const args: Ast[] = [];
    if (this.peek()?.t === 'rp') {
      this.i++;
      return args;
    }
    if (this.peek() === undefined) return args;
    for (;;) {
      args.push(this.parseOr());
      const t = this.peek();
      if (!t) return args; // auto-closed
      if (t.t === 'comma') {
        this.i++;
        continue;
      }
      if (t.t === 'rp') {
        this.i++;
        return args;
      }
      this.fail();
    }
  }

  private parsePrimary(): Ast {
    const t = this.peek();
    if (!t) this.fail();
    switch (t.t) {
      case 'num':
        this.i++;
        return this.numAst(t);
      case 'id':
        this.i++;
        return { k: 'id', name: t.s, pos: t.pos };
      case 'lp': {
        this.i++;
        const args = this.parseArgs();
        if (args.length !== 1) throw syntaxError(t.pos);
        return { k: 'paren', a: args[0] };
      }
      case 'fn': {
        this.i++;
        const args = this.parseArgs();
        return { k: 'call', name: t.s, args };
      }
      case 'item':
        this.i++;
        return this.itemAst(t.item, t.pos);
      default:
        return this.fail();
    }
  }

  private itemAst(it: Item, pos: number): Ast {
    switch (it.k) {
      case 'frac':
        return { k: 'bin', op: '÷', a: this.parseSub(it.n), b: this.parseSub(it.d) };
      case 'mix':
        return {
          k: 'bin',
          op: '+',
          a: this.parseSub(it.w),
          b: { k: 'bin', op: '÷', a: this.parseSub(it.n), b: this.parseSub(it.d) },
        };
      case 'sqrt':
        return { k: 'call', name: 'sqrt', args: [this.parseSub(it.a)] };
      case 'cbrt':
        return { k: 'call', name: 'cbrt', args: [this.parseSub(it.a)] };
      case 'root':
        return { k: 'call', name: 'nthroot', args: [this.parseSub(it.n), this.parseSub(it.a)] };
      case 'abs':
        return { k: 'call', name: 'abs', args: [this.parseSub(it.a)] };
      case 'logb': {
        const base = this.parseSub(it.b);
        if (this.peek()?.t !== 'lp') throw syntaxError(pos);
        this.i++;
        const args = this.parseArgs();
        if (args.length !== 1) throw syntaxError(pos);
        return { k: 'call', name: 'logb', args: [base, args[0]] };
      }
      case 'sigma':
        return { k: 'sigma', lo: this.parseSub(it.lo), hi: this.parseSub(it.hi), body: this.parseSub(it.body) };
      case 'integ':
        return { k: 'integ', lo: this.parseSub(it.lo), hi: this.parseSub(it.hi), body: this.parseSub(it.body) };
      case 'deriv':
        return { k: 'deriv', body: this.parseSub(it.body), at: this.parseSub(it.at) };
      default:
        throw syntaxError(pos);
    }
  }
}

export function parseEquation(items: Slot): Ast {
  try {
    return new Parser(lex(items, 10), 10, 0).parseEquation();
  } catch (e) {
    if (e instanceof RangeError) throw stackError();
    throw e;
  }
}

export function parse(items: Slot, radix = 10, baseMode = false): Ast {
  try {
    const ast = new Parser(lex(items, radix, baseMode), radix, 0, baseMode).parseAll();
    checkStack(ast);
    return ast;
  } catch (e) {
    if (e instanceof CalcError) throw e;
    if (e instanceof RangeError) throw stackError(); // JS stack overflow on pathological nesting
    throw e;
  }
}

// ------------------------------------------------------------------ stack limits (10 numbers / 24 commands)

const MAX_NUMS = 10;
const MAX_CMDS = 24;

function checkStack(ast: Ast): void {
  const walk = (a: Ast, pn: number, pc: number): void => {
    if (pn + 1 > MAX_NUMS || pc > MAX_CMDS) throw stackError();
    switch (a.k) {
      case 'num':
        if (a.exp) walk(a.exp, pn, pc + 1);
        return;
      case 'id':
        return;
      case 'neg':
        return walk(a.a, pn, pc + 1);
      case 'post':
        return walk(a.a, pn, pc);
      case 'bin':
        walk(a.a, pn, pc);
        return walk(a.b, pn + 1, pc + 1);
      case 'call':
        a.args.forEach((x, i) => walk(x, pn + i, pc + 1));
        return;
      case 'dms':
        return;
      case 'sigma':
      case 'integ':
        walk(a.lo, pn, pc + 1);
        walk(a.hi, pn + 1, pc + 1);
        return walk(a.body, pn + 2, pc + 1);
      case 'deriv':
        walk(a.body, pn, pc + 1);
        return walk(a.at, pn + 1, pc + 1);
      case 'convert':
        return walk(a.a, pn, pc + 1);
      case 'paren':
        return walk(a.a, pn, pc + 1);
    }
  };
  walk(ast, 0, 0);
}
