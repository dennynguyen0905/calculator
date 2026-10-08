// TABLE mode: tabulate f(X) (and g(X)) over Start / End / Step.

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { CalcError, argError, mathError } from '../errors';
import { evalItems, type Val } from '../evaluator';
import { row, text } from '../format/rnode';
import { CellGrid, shortNum } from '../grid';
import { ExprLine } from '../exprline';
import type { Slot } from '../items';
import * as N from '../num';
import type { Num } from '../num';
import { numNode } from '../format/value';
import type { Row } from '../screen';
import { numFromJ, numToJ } from '../serialize';

type Stage = 'f' | 'g' | 'range' | 'table';

interface Cell {
  v: Num | null; // null = error
}

const MAX_F = 30;
const MAX_FG = 20;

export class TableController implements ModeController {
  stage: Stage = 'f';
  f: ExprLine;
  g: ExprLine;
  range: CellGrid;
  xs: Num[] = [];
  fv: Cell[] = [];
  gv: Cell[] = [];
  sel = { r: 0, c: 0 };
  err: CalcError | null = null;

  constructor(private readonly calc: Calculator) {
    this.f = new ExprLine(calc);
    this.g = new ExprLine(calc);
    this.range = new CellGrid(3, 1, calc, (items: Slot): Num => {
      calc.applySetupToCtx();
      const v = evalItems(items, calc.ctx);
      if (v.t !== 'x' && v.t !== 'a') throw mathError();
      return v;
    });
    this.range.advance = 'down';
    this.range.set(0, 0, N.ONE);
    this.range.set(1, 0, N.fromInt(5));
    this.range.set(2, 0, N.ONE);
  }

  private get twoFn(): boolean {
    return this.calc.setup.tableFn === 'fg';
  }

  enter(): void {
    this.stage = 'f';
    this.err = null;
  }

  // ------------------------------------------------------------ evaluation

  private evalAt(items: Slot, x: Num): Cell {
    const ctx = this.calc.ctx;
    const saved = ctx.vars.X;
    ctx.vars.X = x;
    try {
      this.calc.applySetupToCtx();
      const v: Val = evalItems(items, ctx);
      return { v: v.t === 'x' || v.t === 'a' ? v : null };
    } catch (e) {
      if (e instanceof CalcError) return { v: null };
      throw e;
    } finally {
      if (saved === undefined) delete ctx.vars.X;
      else ctx.vars.X = saved;
    }
  }

  private build(): void {
    const start = this.range.get(0, 0);
    const end = this.range.get(1, 0);
    const step = this.range.get(2, 0);
    try {
      if (N.isZero(step) || N.sign(step) !== N.sign(N.sub(end, start)) && !N.isZero(N.sub(end, start))) throw argError();
      const count = N.toBigInt(N.floorNum(N.div(N.sub(end, start), step)));
      const limit = this.twoFn ? MAX_FG : MAX_F;
      if (count === null || count + 1n > BigInt(limit)) throw argError();
      this.xs = [];
      for (let i = 0n; i <= count; i++) this.xs.push(N.add(start, N.mul(step, N.fromInt(i))));
      this.fv = this.xs.map((x) => this.evalAt(this.f.items, x));
      this.gv = this.twoFn ? this.xs.map((x) => this.evalAt(this.g.items, x)) : [];
      this.sel = { r: 0, c: 0 };
      this.stage = 'table';
      this.err = null;
    } catch (e) {
      if (e instanceof CalcError) this.err = e;
      else throw e;
    }
  }

  // ------------------------------------------------------------ keys

  handle(cmd: string): boolean {
    if (this.err) {
      if (cmd === 'ac') {
        this.err = null;
        this.stage = 'range';
      }
      return true;
    }
    switch (this.stage) {
      case 'f':
      case 'g': {
        const line = this.stage === 'f' ? this.f : this.g;
        const r = line.handle(cmd);
        if (r === 'enter' && line.items.length > 0) {
          this.stage = this.stage === 'f' && this.twoFn ? 'g' : 'range';
        } else if (r === 'cancel') line.clear();
        return true;
      }
      case 'range': {
        const g = this.range;
        if (cmd === 'eq' && g.sel.r === g.rows - 1) {
          g.handle('eq');
          g.sel = { r: 2, c: 0 };
          if (!g.error) this.build();
          return true;
        }
        if (cmd === 'ac' && !g.ed) {
          this.stage = this.twoFn ? 'g' : 'f';
          return true;
        }
        g.handle(cmd);
        return true;
      }
      case 'table': {
        const cols = this.twoFn ? 3 : 2;
        switch (cmd) {
          case 'up':
            if (this.sel.r > 0) this.sel.r--;
            break;
          case 'down':
            if (this.sel.r < this.xs.length - 1) this.sel.r++;
            break;
          case 'left':
            if (this.sel.c > 0) this.sel.c--;
            break;
          case 'right':
            if (this.sel.c < cols - 1) this.sel.c++;
            break;
          case 'ac':
            this.stage = 'f';
            break;
          default:
            break;
        }
        return true;
      }
    }
  }

  // ------------------------------------------------------------ screen

  screen(): ModeScreen {
    const status = { mode: 'TABLE' };
    if (this.err) {
      return { rows: [{ t: 'line', text: this.err.message }, { t: 'line', text: '' }, { t: 'line', text: '[AC]  :Cancel', dim: true }], status };
    }
    switch (this.stage) {
      case 'f':
      case 'g': {
        const line = this.stage === 'f' ? this.f : this.g;
        return {
          rows: [{ t: 'line', text: this.stage === 'f' ? 'f(X)=' : 'g(X)=' }, { t: 'expr', node: line.node() }],
          cursorRow: 1,
          status,
        };
      }
      case 'range': {
        const g = this.range;
        const labels = ['Start', 'End', 'Step'];
        const rows: Row[] = [{ t: 'line', text: 'Table range', title: true }];
        for (let r = 0; r < 3; r++) {
          const isSel = r === g.sel.r;
          rows.push({
            t: 'cells',
            cells: [
              { text: labels[r], w: 30 },
              { text: g.ed && isSel ? '' : g.cellText(r, 0, 14), inv: isSel && !g.ed, cursor: isSel && !!g.ed, node: g.ed && isSel ? g.detailNode() : undefined, w: 70 },
            ],
          });
        }
        return { rows, cursorRow: g.ed ? 1 + g.sel.r : undefined, status };
      }
      case 'table': {
        const cols = this.twoFn ? 3 : 2;
        const w = Math.floor(100 / cols);
        const rows: Row[] = [{ t: 'cells', cells: ['x', 'f(x)', ...(this.twoFn ? ['g(x)'] : [])].map((t) => ({ text: t, w })) }];
        const visible = 2;
        const top = Math.min(Math.max(0, this.sel.r - (visible - 1)), Math.max(0, this.xs.length - visible));
        for (let r = top; r < Math.min(this.xs.length, top + visible); r++) {
          const cellText = (c: number): string => {
            const v = c === 0 ? this.xs[r] : c === 1 ? this.fv[r].v : this.gv[r].v;
            return v ? shortNum(v, 9, this.calc.setup) : 'ERROR';
          };
          rows.push({ t: 'cells', cells: Array.from({ length: cols }, (_, c) => ({ text: cellText(c), inv: r === this.sel.r && c === this.sel.c, w })) });
        }
        const v = this.sel.c === 0 ? this.xs[this.sel.r] : this.sel.c === 1 ? this.fv[this.sel.r].v : this.gv[this.sel.r].v;
        rows.push({ t: 'expr', node: v ? row(numNode(v, this.calc.setup)) : text('ERROR') });
        return { rows, status: { ...status, up: top > 0, down: top + visible < this.xs.length } };
      }
    }
  }

  // ------------------------------------------------------------ persistence

  serialize(): unknown {
    return {
      f: this.f.items,
      g: this.g.items,
      range: [0, 1, 2].map((r) => (this.range.cells[r][0] ? numToJ(this.range.cells[r][0]!) : null)),
    };
  }
  restore(j: unknown): void {
    const o = j as { f?: Slot; g?: Slot; range?: (Record<string, unknown> | null)[] };
    if (o?.f) this.f.set(o.f);
    if (o?.g) this.g.set(o.g);
    o?.range?.forEach((v, i) => v && this.range.set(i, 0, numFromJ(v)));
  }
}

registerMode('TABLE', (c) => new TableController(c));
