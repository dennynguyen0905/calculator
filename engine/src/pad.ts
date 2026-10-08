// ExprPad: the calculation pad (expression editor + result + history + CALC / SOLVE) used by COMP, CMPLX,
// BASE-N, MATRIX, VECTOR and the STAT calculation screen.

import type { Ast } from './ast';
import { CalcError } from './errors';
import {
  deleteBack,
  moveDown,
  moveEnd,
  moveHome,
  moveLeft,
  moveRight,
  moveUp,
  newEditor,
  type Editor,
} from './editor/editor';
import { renderEditor, renderItems } from './editor/render';
import type { Calculator } from './calculator';
import { D } from './dec';
import { ev, type Val } from './evaluator';
import { compileFast } from './fast';
import { formatValue, type ValueView } from './format/value';
import { plain as plainText, text } from './format/rnode';
import { ANS_OPS, applyInsert, isInsertCmd } from './inputcmds';
import type { Item, Slot } from './items';
import * as N from './num';
import { parse, parseEquation } from './parser';
import type { Row } from './screen';
import { solveRoot } from './solver';
import { valFromJ, valToJ } from './serialize';

export interface PadResult {
  val: Val;
  toggled: boolean;
  engStep: number;
  dms: boolean;
  cx?: 'rect' | 'polar';
}

type Session =
  | {
      kind: 'calc' | 'solve';
      items: Slot;
      vars: string[];
      idx: number;
      input: Editor;
      stage: 'ask' | 'show';
      result?: PadResult;
      solveVar?: string;
      eqnRows?: string[];
    }
  | null;

export interface HistEntry {
  items: Slot;
  val: Val | null;
}

export interface PadOptions {
  /** evaluate an expression (already split at ':') */
  evalFn: (items: Slot) => Val;
  /** custom result formatter (BASE-N) */
  format?: (r: PadResult) => ValueView;
  /** allow CALC / SOLVE */
  allowCalc?: boolean;
}

const MAX_HIST = 100;

/** collect variable ids (A-F, X, Y, M) in order of first appearance */
export function collectVars(ast: Ast, out: string[] = []): string[] {
  const add = (n: string) => {
    if (/^[A-FXYM]$/.test(n) && !out.includes(n)) out.push(n);
  };
  const walk = (a: Ast): void => {
    switch (a.k) {
      case 'id':
        add(a.name);
        break;
      case 'num':
        if (a.exp) walk(a.exp);
        break;
      case 'neg':
      case 'paren':
      case 'post':
      case 'convert':
        walk(a.a);
        break;
      case 'bin':
        walk(a.a);
        walk(a.b);
        break;
      case 'call':
        a.args.forEach(walk);
        break;
      case 'dms':
        [a.deg, a.min, a.sec].forEach((x) => x && walk(x));
        break;
      case 'sigma':
      case 'integ':
        walk(a.lo);
        walk(a.hi);
        walk(a.body);
        break;
      case 'deriv':
        walk(a.body);
        walk(a.at);
        break;
    }
  };
  walk(ast);
  return out;
}

/** split top-level items at ':' */
export function splitStatements(items: Slot): Slot[] {
  const out: Slot[] = [[]];
  for (const it of items) {
    if (it.k === 'c' && it.s === ':') out.push([]);
    else out[out.length - 1].push(it);
  }
  return out.filter((s, i) => s.length > 0 || i === 0);
}

export class ExprPad {
  ed: Editor = newEditor();
  /** expression shown above a result (a copy of what was evaluated) */
  shown: Slot = [];
  result: PadResult | null = null;
  error: CalcError | null = null;
  hist: HistEntry[] = [];
  histPos = -1;
  session: Session = null;
  /** the expression stays in the editor after an error so ◀▶ can jump to the failing position */
  constructor(
    readonly calc: Calculator,
    readonly opts: PadOptions,
  ) {}

  // ------------------------------------------------------------ helpers

  private get line(): boolean {
    return this.calc.setup.io === 'line';
  }

  private clearResult(): void {
    this.result = null;
    this.error = null;
  }

  private startFresh(): void {
    this.ed = newEditor();
    this.clearResult();
    this.histPos = -1;
  }

  private evalStatements(items: Slot): Val {
    const stmts = splitStatements(items);
    let v: Val | undefined;
    for (const s of stmts) {
      v = this.opts.evalFn(s);
      this.calc.setAns(v);
    }
    return v!;
  }

  // ------------------------------------------------------------ equals

  private equals(): void {
    if (this.ed.root.length === 0 && !this.result) return;
    const items = JSON.parse(JSON.stringify(this.ed.root.length > 0 ? this.ed.root : this.shown)) as Slot;
    this.shown = items;
    try {
      const v = this.evalStatements(items);
      this.result = { val: v, toggled: false, engStep: 0, dms: false };
      this.error = null;
      this.hist.push({ items, val: v });
      if (this.hist.length > MAX_HIST) this.hist.shift();
      this.histPos = this.hist.length - 1; // ▲ then shows the calculation before this one
    } catch (e) {
      if (e instanceof CalcError) {
        this.error = e;
        this.result = null;
      } else throw e;
    }
  }

  /** evaluate the current expression (or Ans when empty) for M+/M- and similar; returns value or null on error */
  evalCurrent(): Val | null {
    try {
      if (this.ed.root.length === 0) return this.result ? this.result.val : this.calc.ctx.ans;
      const v = this.evalStatements(JSON.parse(JSON.stringify(this.ed.root)) as Slot);
      this.shown = JSON.parse(JSON.stringify(this.ed.root)) as Slot;
      this.result = { val: v, toggled: false, engStep: 0, dms: false };
      this.error = null;
      return v;
    } catch (e) {
      if (e instanceof CalcError) {
        this.error = e;
        this.result = null;
        return null;
      }
      throw e;
    }
  }

  // ------------------------------------------------------------ command handling

  handle(cmd: string): boolean {
    if (this.session) return this.handleSession(cmd);
    if (this.error) return this.handleError(cmd);

    switch (cmd) {
      case 'eq':
        this.equals();
        return true;
      case 'ac':
        this.startFresh();
        return true;
      case 'left':
        if (this.result) {
          this.ed = cloneForEdit(this.shown);
          this.clearResult();
          moveEnd(this.ed);
        } else moveLeft(this.ed);
        return true;
      case 'right':
        if (this.result) {
          this.ed = cloneForEdit(this.shown);
          this.clearResult();
          moveHome(this.ed);
        } else moveRight(this.ed);
        return true;
      case 'up':
        if (!this.result && moveUp(this.ed)) return true;
        this.replay(-1);
        return true;
      case 'down':
        if (!this.result && moveDown(this.ed)) return true;
        this.replay(1);
        return true;
      case 'del':
        if (this.result) {
          this.ed = cloneForEdit(this.shown);
          this.clearResult();
          moveEnd(this.ed);
        }
        deleteBack(this.ed);
        return true;
      case 'ins':
        this.ed.insert = !this.ed.insert;
        return true;
      case 'sd':
        if (this.result) {
          const view = this.view(this.result);
          if (view.canToggle) this.result.toggled = !this.result.toggled;
        }
        return true;
      case 'eng':
        if (this.result && (this.result.val.t === 'x' || this.result.val.t === 'a')) this.result.engStep++;
        return true;
      case 'engl':
        if (this.result && (this.result.val.t === 'x' || this.result.val.t === 'a')) this.result.engStep--;
        return true;
      case 'calc':
        return this.startSession('calc');
      case 'solve':
        return this.startSession('solve');
      case 'factcmd':
        return this.factorize();
      case 'tok:▶r∠θ':
      case 'tok:▶a+bi':
        if (this.result && this.result.val.t === 'c') this.result.cx = cmd === 'tok:▶r∠θ' ? 'polar' : 'rect';
        return true;
      case 'tok:▶DMS':
        if (this.result && (this.result.val.t === 'x' || this.result.val.t === 'a')) this.result.dms = true;
        return true;
      default:
        break;
    }
    if (!isInsertCmd(cmd)) return false;
    this.beforeInsert(cmd);
    applyInsert(this.ed, cmd, this.calc.takeHyp(), this.line);
    this.histPos = -1;
    return true;
  }

  private beforeInsert(cmd: string): void {
    if (this.result) {
      const ans = this.result.val;
      this.startFresh();
      if (ANS_OPS.has(cmd) && ans) {
        this.ed.root.push({ k: 'c', s: 'Ans' } as Item);
        this.ed.cur.idx = 1;
      }
    }
  }

  private handleError(cmd: string): boolean {
    const err = this.error!;
    switch (cmd) {
      case 'ac':
        this.startFresh();
        this.error = null;
        return true;
      case 'left':
      case 'right': {
        this.ed = cloneForEdit(this.shown);
        this.error = null;
        const pos = err.pos;
        if (pos !== undefined && pos >= 0 && pos <= this.ed.root.length) {
          this.ed.cur = { path: [], idx: Math.min(pos + (cmd === 'right' ? 0 : 1), this.ed.root.length) };
        } else moveEnd(this.ed);
        return true;
      }
      default:
        return true; // other keys are ignored while an error is displayed
    }
  }

  private factorize(): boolean {
    if (!this.result) this.equals();
    if (!this.result) return true;
    const v = this.result.val;
    if (v.t === 'x' || v.t === 'a') {
      const n = N.toBigInt(v);
      if (n !== null && n >= 2n && n <= 9_999_999_999n) {
        this.result = { val: { t: 'pf', n }, toggled: false, engStep: 0, dms: false };
      } else {
        this.error = new CalcError('Math');
        this.result = null;
      }
    }
    return true;
  }

  // ------------------------------------------------------------ history (REPLAY)

  private replay(dir: -1 | 1): void {
    if (this.hist.length === 0) return;
    let pos = this.histPos;
    if (pos < 0) {
      if (dir > 0) return;
      pos = this.hist.length - 1;
    } else {
      pos += dir;
      if (pos < 0) return;
      if (pos >= this.hist.length) {
        this.startFresh();
        return;
      }
    }
    // show the recalled calculation with its result (editing keys then take over, as after "=")
    const h = this.hist[pos];
    this.shown = JSON.parse(JSON.stringify(h.items)) as Slot;
    this.ed = newEditor();
    this.error = null;
    this.result = h.val ? { val: h.val, toggled: false, engStep: 0, dms: false } : null;
    if (!this.result) this.ed = cloneForEdit(h.items);
    this.histPos = pos;
  }

  // ------------------------------------------------------------ result view

  view(r: PadResult): ValueView {
    if (this.opts.format) return this.opts.format(r);
    return formatValue(r.val, this.calc.setup, { toggled: r.toggled, engStep: r.engStep, dms: r.dms, complexFmt: r.cx });
  }

  // ------------------------------------------------------------ CALC / SOLVE

  private startSession(kind: 'calc' | 'solve'): boolean {
    if (!this.opts.allowCalc) return true;
    const src = this.ed.root.length > 0 ? this.ed.root : this.shown;
    if (src.length === 0) return true;
    const items = JSON.parse(JSON.stringify(src)) as Slot;
    let ast: Ast;
    try {
      ast = parseEquation(items);
    } catch (e) {
      if (e instanceof CalcError) {
        this.error = e;
        this.shown = items;
        return true;
      }
      throw e;
    }
    const vars = collectVars(ast.k === 'bin' && ast.op === '=' ? { k: 'bin', op: '+', a: ast.a, b: ast.b } : ast);
    let solveVar: string | undefined;
    let ask = vars;
    if (kind === 'solve') {
      if (!(ast.k === 'bin' && ast.op === '=') && vars.length === 0) {
        this.error = new CalcError('Syntax');
        this.shown = items;
        return true;
      }
      solveVar = vars.includes('X') ? 'X' : vars[0];
      ask = [...vars.filter((v) => v !== solveVar), solveVar];
    }
    this.shown = items;
    this.session = { kind, items, vars: ask, idx: 0, input: newEditor(), stage: 'ask', solveVar };
    if (ask.length === 0) this.finishSession();
    return true;
  }

  private varText(name: string): string {
    const v = this.calc.ctx.vars[name];
    if (!v) return '0';
    return formatPlainOneLine(v, this);
  }

  private handleSession(cmd: string): boolean {
    const s = this.session!;
    if (s.stage === 'show') {
      switch (cmd) {
        case 'ac':
          this.session = null;
          this.ed = cloneForEdit(s.items);
          this.result = null;
          return true;
        case 'calc':
        case 'solve':
        case 'eq':
        case 'up':
        case 'down':
        case 'left':
        case 'right':
          s.stage = 'ask';
          s.idx = 0;
          s.input = newEditor();
          return true;
        case 'sd':
          if (s.result && this.view(s.result).canToggle) s.result.toggled = !s.result.toggled;
          return true;
        default:
          return true;
      }
    }
    // ask stage
    switch (cmd) {
      case 'ac':
        this.session = null;
        this.ed = cloneForEdit(s.items);
        this.clearResult();
        return true;
      case 'eq':
      case 'down':
        this.acceptInput();
        return true;
      case 'up':
        if (s.idx > 0) {
          s.idx--;
          s.input = newEditor();
        }
        return true;
      case 'left':
        moveLeft(s.input);
        return true;
      case 'right':
        moveRight(s.input);
        return true;
      case 'del':
        deleteBack(s.input);
        return true;
      default:
        break;
    }
    if (isInsertCmd(cmd)) {
      applyInsert(s.input, cmd, this.calc.takeHyp(), this.line);
      return true;
    }
    return true;
  }

  private acceptInput(): void {
    const s = this.session!;
    const name = s.vars[s.idx];
    try {
      if (s.input.root.length > 0) {
        const v = this.opts.evalFn(s.input.root);
        this.calc.ctx.vars[name] = v;
      }
    } catch (e) {
      if (e instanceof CalcError) {
        this.session = null;
        this.error = e;
        return;
      }
      throw e;
    }
    s.input = newEditor();
    s.idx++;
    if (s.idx >= s.vars.length) this.finishSession();
  }

  private finishSession(): void {
    const s = this.session!;
    try {
      if (s.kind === 'calc') {
        let ast: Ast = parseEquation(s.items);
        const ctx = this.calc.ctx;
        if (ast.k === 'bin' && ast.op === '=') {
          const l = ev(ast.a, ctx);
          const r = ev(ast.b, ctx);
          const val: Val = { t: 'multi', items: [{ label: 'L', v: l }, { label: 'R', v: r }] };
          s.result = { val, toggled: false, engStep: 0, dms: false };
        } else {
          ast = parse(s.items);
          const v = this.evalStatements(s.items);
          s.result = { val: v, toggled: false, engStep: 0, dms: false };
        }
      } else {
        s.result = this.runSolve(s);
      }
      s.stage = 'show';
    } catch (e) {
      if (e instanceof CalcError) {
        this.session = null;
        this.error = e;
        return;
      }
      throw e;
    }
  }

  private runSolve(s: NonNullable<Session>): PadResult {
    const ctx = this.calc.ctx;
    const name = s.solveVar!;
    const eq = parseEquation(s.items);
    const left = eq.k === 'bin' && eq.op === '=' ? eq.a : eq;
    const right = eq.k === 'bin' && eq.op === '=' ? eq.b : null;
    const diff: Ast = right ? { k: 'bin', op: '-', a: left, b: right } : left;
    const guessV = ctx.vars[name] ?? N.ZERO;
    const guess = N.isExact(guessV as N.Num) || (guessV as N.Num).t === 'a' ? N.toNumber(guessV as N.Num) : 0;
    const fast = compileFast(diff, { angle: ctx.angle, varValue: (n) => (/^[A-FYM]$/.test(n) && n !== name ? scalarNum(ctx.vars[n]) : undefined) }, name);
    const saved = ctx.vars[name];
    const f = fast
      ? fast
      : (x: number): number => {
          ctx.vars[name] = N.na(new D(x));
          const v = ev(diff, ctx);
          if (v.t !== 'x' && v.t !== 'a') throw new CalcError('Math');
          return N.toNumber(v);
        };
    let root: number | null;
    try {
      root = solveRoot(f, guess);
    } catch (e) {
      ctx.vars[name] = saved;
      throw e;
    }
    if (root === null || !Number.isFinite(root)) {
      ctx.vars[name] = saved;
      throw new CalcError("Can't Solve");
    }
    const rootNum = N.na(new D(root));
    ctx.vars[name] = rootNum;
    // residual with the exact evaluator at the rounded root
    let res: N.Num = N.ZERO;
    try {
      const v = ev(diff, ctx);
      if (v.t === 'x' || v.t === 'a') res = v;
    } catch {
      /* ignore */
    }
    const mag = Math.max(1, Math.abs(root));
    if (Math.abs(N.toNumber(res)) < 1e-12 * mag) res = N.ZERO;
    return {
      val: {
        t: 'multi',
        items: [
          { label: name, v: rootNum },
          { label: 'L−R', v: res },
        ],
      },
      toggled: false,
      engStep: 0,
      dms: false,
    };
  }

  // ------------------------------------------------------------ rendering

  rows(): { rows: Row[]; cursorRow?: number; disp?: boolean } {
    if (this.session) return this.sessionRows();
    if (this.error) {
      return {
        rows: [
          { t: 'line', text: this.error.message, align: 'left' },
          { t: 'line', text: '' },
          { t: 'line', text: '[AC]  :Cancel', align: 'left', dim: true },
          { t: 'line', text: '[◀][▶]:Goto', align: 'left', dim: true },
        ],
      };
    }
    if (this.result) {
      const v = this.view(this.result);
      return {
        rows: [
          { t: 'expr', node: renderItems(this.shown) },
          { t: 'result', nodes: v.lines },
        ],
        disp: v.lines.length > 1,
      };
    }
    const first = this.hist.length === 0 && this.ed.root.length === 0;
    return {
      rows: [
        { t: 'expr', node: renderEditor(this.ed) },
        { t: 'result', nodes: [text(first ? '0' : '')], dim: true },
      ],
      cursorRow: 0,
    };
  }

  private sessionRows(): { rows: Row[]; cursorRow?: number; disp?: boolean } {
    const s = this.session!;
    const exprRow: Row = { t: 'expr', node: renderItems(s.items) };
    if (s.stage === 'show' && s.result) {
      const v = this.view(s.result);
      return { rows: [exprRow, { t: 'result', nodes: v.lines }], disp: v.lines.length > 1 };
    }
    const name = s.vars[s.idx];
    const prompt = s.kind === 'solve' && name === s.solveVar ? `Solve for ${name}` : `${name}?`;
    const cur = this.varText(name);
    return {
      rows: [
        exprRow,
        { t: 'line', text: prompt, align: 'left' },
        s.input.root.length > 0 ? { t: 'expr', node: renderEditor(s.input) } : { t: 'node', node: { t: 'row', c: [{ t: 'cur', ins: true }, text(cur)] }, align: 'right' },
      ],
      cursorRow: 2,
    };
  }

  // ------------------------------------------------------------ persistence

  serialize(): unknown {
    return { hist: this.hist.map((h) => ({ items: h.items, val: h.val ? valToJ(h.val) : null })) };
  }
  restore(j: unknown): void {
    const o = j as { hist?: { items?: Slot; val?: Record<string, unknown> | null }[] | Slot[] };
    if (!o?.hist) return;
    this.hist = (o.hist as { items?: Slot; val?: Record<string, unknown> | null }[])
      .filter((h) => Array.isArray(h?.items))
      .map((h) => {
        let val: Val | null = null;
        try {
          val = h.val ? valFromJ(h.val) : null;
        } catch {
          val = null;
        }
        return { items: h.items as Slot, val };
      });
  }
}

function cloneForEdit(items: Slot): Editor {
  const e = newEditor(JSON.parse(JSON.stringify(items)) as Slot);
  return e;
}

function scalarNum(v: Val | undefined): number | undefined {
  if (!v) return 0;
  return v.t === 'x' || v.t === 'a' ? N.toNumber(v) : undefined;
}

function formatPlainOneLine(v: Val, pad: ExprPad): string {
  const lines = formatValue(v, pad.calc.setup).lines;
  return lines.map((l) => plainText(l)).join(' ');
}

