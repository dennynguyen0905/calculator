// MATRIX and VECTOR modes: define MatA..MatD / VctA..VctD, then calculate with the usual operators.

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { CalcError, mathError } from '../errors';
import { evalItems, type EvalCtx, type Val } from '../evaluator';
import { row, text } from '../format/rnode';
import { CellGrid, shortNum } from '../grid';
import * as M from '../matrix';
import * as N from '../num';
import type { Num } from '../num';
import { numNode } from '../format/value';
import { ExprPad } from '../pad';
import type { Row } from '../screen';
import { valFromJ, valToJ } from '../serialize';
import type { Slot } from '../items';

type Kind = 'MAT' | 'VCT';
const NAMES = ['A', 'B', 'C', 'D'];

export class MatrixController implements ModeController {
  stage: 'calc' | 'dim' | 'edit' = 'calc';
  mats: Record<string, M.MatVal> = {};
  ans: M.MatVal | null = null;
  cur = 'A';
  dim: CellGrid;
  grid: CellGrid;
  readonly pad: ExprPad;
  resSel = { r: 0, c: 0 };
  lastResult: unknown = null;

  constructor(
    private readonly calc: Calculator,
    private readonly kind: Kind,
  ) {
    const evalCell = (items: Slot): Num => {
      calc.applySetupToCtx();
      const v = evalItems(items, calc.ctx);
      if (v.t !== 'x' && v.t !== 'a') throw mathError();
      return v;
    };
    this.dim = new CellGrid(kind === 'MAT' ? 2 : 1, 1, calc, evalCell);
    this.dim.advance = 'down';
    this.grid = new CellGrid(1, 1, calc, evalCell);
    this.grid.advance = 'right';
    this.pad = new ExprPad(calc, {
      allowCalc: false,
      evalFn: (items: Slot): Val => {
        calc.applySetupToCtx();
        const ctx: EvalCtx = { ...calc.ctx, lookup: (n) => this.lookup(n) };
        const v = evalItems(items, ctx);
        if (v.t === 'm') this.ans = v;
        return v;
      },
    });
  }

  private get prefix(): string {
    return this.kind === 'MAT' ? 'Mat' : 'Vct';
  }

  private lookup(name: string): Val | undefined {
    if (!name.startsWith(this.prefix)) return undefined;
    const rest = name.slice(3);
    if (rest === 'Ans') {
      if (!this.ans) throw mathError();
      return this.ans;
    }
    if (!NAMES.includes(rest)) return undefined;
    const m = this.mats[rest];
    if (!m) throw mathError();
    return m;
  }

  // ------------------------------------------------------------ definition flow

  enter(): void {
    this.stage = 'calc';
    this.openSelect(true);
  }

  private openSelect(thenEdit: boolean): void {
    this.calc.openMenu({
      title: this.kind === 'MAT' ? 'Select Matrix' : 'Select Vector',
      items: NAMES.map((n, i) => ({ label: `${i + 1}:${this.prefix}${n}` })),
      sel: Math.max(0, NAMES.indexOf(this.cur)),
      digits: 'index',
      pick: (i) => {
        this.cur = NAMES[i];
        if (thenEdit) this.startDim();
      },
      cancel: () => {
        this.stage = 'calc';
      },
    });
  }

  private startDim(): void {
    const old = this.mats[this.cur];
    this.dim.sel = { r: 0, c: 0 };
    this.dim.set(0, 0, N.fromInt(old ? (this.kind === 'MAT' ? old.rows : old.cols) : this.kind === 'MAT' ? 3 : 3));
    if (this.kind === 'MAT') this.dim.set(1, 0, N.fromInt(old ? old.cols : 3));
    this.stage = 'dim';
  }

  private finishDim(): void {
    const a = N.toBigInt(this.dim.get(0, 0));
    const b = this.kind === 'MAT' ? N.toBigInt(this.dim.get(1, 0)) : 1n;
    const max = this.kind === 'MAT' ? 4n : 3n;
    const min = this.kind === 'MAT' ? 1n : 2n;
    if (a === null || b === null || a < min || b < 1n || (this.kind === 'MAT' ? a > max || b > max : a > max)) {
      this.dim.error = new CalcError('Argument');
      return;
    }
    const rows = this.kind === 'MAT' ? Number(a) : 1;
    const cols = this.kind === 'MAT' ? Number(b) : Number(a);
    const old = this.mats[this.cur];
    this.grid.resize(rows, cols);
    this.grid.sel = { r: 0, c: 0 };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.grid.set(r, c, old && r < old.rows && c < old.cols ? M.at(old, r, c) : N.ZERO);
    this.commitData();
    this.stage = 'edit';
  }

  private commitData(): void {
    const g = this.grid;
    const a: Num[] = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) a.push(g.get(r, c));
    this.mats[this.cur] = this.kind === 'MAT' ? M.mk(g.rows, g.cols, a) : M.vector(a);
  }

  // ------------------------------------------------------------ menu (SHIFT 4 / SHIFT 5)

  private openMenu(): void {
    const calc = this.calc;
    const P = this.prefix;
    const items: { label: string; act: () => void }[] = [
      { label: 'Dim', act: () => this.openSelect(true) },
      { label: 'Data', act: () => this.openSelect(true) },
      ...NAMES.map((n) => ({ label: `${P}${n}`, act: () => this.pad.handle(`tok:${P}${n}`) })),
      { label: `${P}Ans`, act: () => this.pad.handle(`tok:${P}Ans`) },
    ];
    if (this.kind === 'MAT') {
      items.push({ label: 'det(', act: () => this.pad.handle('tok:det(') }, { label: 'Trn(', act: () => this.pad.handle('tok:Trn(') }, { label: 'Ident(', act: () => this.pad.handle('tok:Ident(') });
    } else {
      items.push({ label: 'Dot', act: () => this.pad.handle('tok:·') }, { label: 'Angle(', act: () => this.pad.handle('tok:Angle(') }, { label: 'UnitV(', act: () => this.pad.handle('tok:UnitV(') });
    }
    calc.openMenu({
      title: this.kind === 'MAT' ? 'MATRIX' : 'VECTOR',
      items: items.map((it, i) => ({ label: `${(i + 1) % 10}:${it.label}` })),
      sel: 0,
      digits: 'index',
      pick: (i) => items[i].act(),
    });
  }

  // ------------------------------------------------------------ keys

  handle(cmd: string): boolean {
    if (cmd === (this.kind === 'MAT' ? 'matrix' : 'vector')) {
      if (this.stage === 'calc') this.openMenu();
      return true;
    }
    switch (this.stage) {
      case 'dim': {
        const d = this.dim;
        if (cmd === 'eq' && d.sel.r === d.rows - 1) {
          d.handle('eq');
          d.sel = { r: d.rows - 1, c: 0 };
          if (!d.error) this.finishDim();
          return true;
        }
        if (cmd === 'ac' && !d.ed && !d.error) {
          this.stage = 'calc';
          return true;
        }
        d.handle(cmd);
        return true;
      }
      case 'edit': {
        const g = this.grid;
        if (cmd === 'ac' && !g.ed && !g.error) {
          this.commitData();
          this.stage = 'calc';
          this.pad.handle('ac');
          return true;
        }
        g.handle(cmd);
        if (!g.ed) this.commitData();
        return true;
      }
      default:
        break;
    }
    // calculation screen: matrix results are browsed cell by cell
    const res = this.pad.result;
    if (res && res.val.t === 'm' && !res.val.vec) {
      const m = res.val;
      switch (cmd) {
        case 'up':
          if (this.resSel.r > 0) this.resSel.r--;
          return true;
        case 'down':
          if (this.resSel.r < m.rows - 1) this.resSel.r++;
          return true;
        case 'left':
          if (this.resSel.c > 0) this.resSel.c--;
          return true;
        case 'right':
          if (this.resSel.c < m.cols - 1) this.resSel.c++;
          return true;
        default:
          break;
      }
    }
    const r = this.pad.handle(cmd);
    if (this.pad.result && this.pad.result !== this.lastResult) {
      this.lastResult = this.pad.result;
      this.resSel = { r: 0, c: 0 };
    }
    return r;
  }

  currentValue(): Val | null {
    return this.pad.evalCurrent();
  }

  // ------------------------------------------------------------ screen

  private gridRows(g: CellGrid, labelOf: (r: number) => string): Row[] {
    const w = Math.floor(100 / (g.cols + 1));
    const visible = 3;
    const top = Math.min(Math.max(0, g.sel.r - (visible - 1)), Math.max(0, g.rows - visible));
    const rows: Row[] = [];
    for (let r = top; r < Math.min(g.rows, top + visible); r++) {
      const cells: { text: string; inv?: boolean; cursor?: boolean; w?: number }[] = [{ text: labelOf(r), w }];
      for (let c = 0; c < g.cols; c++) {
        const isSel = r === g.sel.r && c === g.sel.c;
        cells.push({ text: g.ed && isSel ? '' : g.cellText(r, c, 8), inv: isSel && !g.ed, cursor: isSel && !!g.ed, w });
      }
      rows.push({ t: 'cells', cells });
    }
    return rows;
  }

  screen(): ModeScreen {
    const status = { mode: this.kind === 'MAT' ? 'MAT' : 'VCT' };
    const P = this.prefix;
    if (this.stage === 'dim') {
      const d = this.dim;
      const labels = this.kind === 'MAT' ? ['m', 'n'] : ['Dim'];
      const rows: Row[] = [{ t: 'line', text: `${P}${this.cur}`, title: true }];
      labels.forEach((l, r) => {
        const isSel = r === d.sel.r;
        rows.push({
          t: 'cells',
          cells: [
            { text: `${l}=`, w: 30 },
            { text: d.ed && isSel ? '' : d.cellText(r, 0, 10), inv: isSel && !d.ed, cursor: isSel && !!d.ed, node: d.ed && isSel ? d.detailNode() : undefined, w: 70 },
          ],
        });
      });
      if (d.error) rows.push({ t: 'line', text: d.error.message });
      return { rows, cursorRow: d.ed ? 1 + d.sel.r : undefined, status };
    }
    if (this.stage === 'edit') {
      const g = this.grid;
      const rows: Row[] = [{ t: 'line', text: `${P}${this.cur}  ${this.kind === 'MAT' ? `${g.rows}×${g.cols}` : `${g.cols}`}`, title: true }, ...this.gridRows(g, (r) => (this.kind === 'MAT' ? String(r + 1) : ''))];
      if (g.error) rows.push({ t: 'line', text: g.error.message });
      return { rows, cursorRow: g.ed ? rows.length - 1 : undefined, status };
    }
    // calculation screen
    const res = this.pad.result;
    if (res && res.val.t === 'm' && !res.val.vec && !this.pad.error) {
      const m = res.val;
      const w = Math.floor(100 / m.cols);
      const visible = 3;
      const top = Math.min(Math.max(0, this.resSel.r - (visible - 1)), Math.max(0, m.rows - visible));
      const rows: Row[] = [];
      for (let r = top; r < Math.min(m.rows, top + visible); r++) {
        rows.push({ t: 'cells', cells: Array.from({ length: m.cols }, (_, c) => ({ text: shortNum(M.at(m, r, c), 9, this.calc.setup), inv: r === this.resSel.r && c === this.resSel.c, w })) });
      }
      rows.push({ t: 'expr', node: row(text(`${this.resSel.r + 1},${this.resSel.c + 1}:`), numNode(M.at(m, this.resSel.r, this.resSel.c), this.calc.setup)) });
      return { rows, status: { ...status, up: top > 0, down: top + visible < m.rows } };
    }
    const r = this.pad.rows();
    return { rows: r.rows, cursorRow: r.cursorRow, status: { ...status, up: this.pad.hist.length > 0, down: this.pad.histPos >= 0 } };
  }

  // ------------------------------------------------------------ persistence

  serialize(): unknown {
    const mats: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.mats)) mats[k] = valToJ(v);
    return { mats, ans: this.ans ? valToJ(this.ans) : null, pad: this.pad.serialize() };
  }
  restore(j: unknown): void {
    const o = j as { mats?: Record<string, Record<string, unknown>>; ans?: Record<string, unknown> | null; pad?: unknown };
    if (o?.mats) for (const [k, v] of Object.entries(o.mats)) this.mats[k] = valFromJ(v) as M.MatVal;
    if (o?.ans) this.ans = valFromJ(o.ans) as M.MatVal;
    if (o?.pad) this.pad.restore(o.pad);
  }
}

registerMode('MATRIX', (c) => new MatrixController(c, 'MAT'));
registerMode('VECTOR', (c) => new MatrixController(c, 'VCT'));
