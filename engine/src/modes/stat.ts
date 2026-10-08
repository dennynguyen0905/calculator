// STAT mode: data editor (X, Y, FREQ) + calculation screen with statistic variables.

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { argError, mathError } from '../errors';
import { evalItems, type EvalCtx, type Val } from '../evaluator';
import { row, text } from '../format/rnode';
import { CellGrid } from '../grid';
import type { Slot } from '../items';
import * as N from '../num';
import type { Num } from '../num';
import { ExprPad } from '../pad';
import type { Row } from '../screen';
import { numFromJ, numToJ } from '../serialize';
import { stdPhi, stdQ, stdR } from '../dist';
import { computeStats, isTwoVar, STAT_TYPES, type StatRow, type Stats, type StatType } from '../stat';

const CAP_1 = 80;
const CAP_2 = 40;

interface VarDef {
  id: string;
  label: string;
  get: (s: Stats) => Num;
}

const SUM_VARS: VarDef[] = [
  { id: 'Σx²', label: 'Σx²', get: (s) => s.sumX2 },
  { id: 'Σx', label: 'Σx', get: (s) => s.sumX },
  { id: 'Σy²', label: 'Σy²', get: (s) => s.sumY2 },
  { id: 'Σy', label: 'Σy', get: (s) => s.sumY },
  { id: 'Σxy', label: 'Σxy', get: (s) => s.sumXY },
  { id: 'Σx³', label: 'Σx³', get: (s) => s.sumX3 },
  { id: 'Σx²y', label: 'Σx²y', get: (s) => s.sumX2Y },
  { id: 'Σx⁴', label: 'Σx⁴', get: (s) => s.sumX4 },
];
const VAR_VARS: VarDef[] = [
  { id: 'n', label: 'n', get: (s) => s.n },
  { id: 'x̄', label: 'x̄', get: (s) => s.meanX },
  { id: 'σx', label: 'σx', get: (s) => s.sigmaX() },
  { id: 'sx', label: 'sx', get: (s) => s.sx() },
  { id: 'ȳ', label: 'ȳ', get: (s) => s.meanY },
  { id: 'σy', label: 'σy', get: (s) => s.sigmaY() },
  { id: 'sy', label: 'sy', get: (s) => s.sy() },
];
const MM_VARS: VarDef[] = [
  { id: 'minX', label: 'minX', get: (s) => s.minX() },
  { id: 'maxX', label: 'maxX', get: (s) => s.maxX() },
  { id: 'minY', label: 'minY', get: (s) => s.minY() },
  { id: 'maxY', label: 'maxY', get: (s) => s.maxY() },
  { id: 'Q1', label: 'Q1', get: (s) => s.Q1() },
  { id: 'Med', label: 'Med', get: (s) => s.Med() },
  { id: 'Q3', label: 'Q3', get: (s) => s.Q3() },
];
const REG_VARS: VarDef[] = [
  { id: '@rA', label: 'A', get: (s) => s.A() },
  { id: '@rB', label: 'B', get: (s) => s.B() },
  { id: '@rC', label: 'C', get: (s) => s.C() },
  { id: 'r', label: 'r', get: (s) => s.r() },
];
const ALL_VARS = [...SUM_VARS, ...VAR_VARS, ...MM_VARS, ...REG_VARS];

export class StatController implements ModeController {
  type: StatType | null = null;
  view: 'editor' | 'calc' = 'editor';
  grid: CellGrid;
  readonly pad: ExprPad;

  constructor(private readonly calc: Calculator) {
    this.grid = new CellGrid(CAP_1, 1, calc, (items: Slot): Num => {
      calc.applySetupToCtx();
      const v = evalItems(items, calc.ctx);
      if (v.t !== 'x' && v.t !== 'a') throw mathError();
      return v;
    });
    this.grid.advance = 'down';
    this.pad = new ExprPad(calc, {
      allowCalc: true,
      evalFn: (items: Slot) => {
        calc.applySetupToCtx();
        const ctx: EvalCtx = { ...calc.ctx, lookup: (n) => this.lookup(n), extraFn: (n, a) => this.extraFn(n, a) };
        return evalItems(items, ctx);
      },
    });
  }

  // ------------------------------------------------------------ data

  private get hasY(): boolean {
    return this.type !== null && isTwoVar(this.type);
  }
  private get hasFreq(): boolean {
    return this.calc.setup.statFreq;
  }
  private get cols(): number {
    return 1 + (this.hasY ? 1 : 0) + (this.hasFreq ? 1 : 0);
  }

  private dataRows(): StatRow[] {
    const g = this.grid;
    const out: StatRow[] = [];
    for (let r = 0; r < g.rows; r++) {
      if (g.isEmpty(r, 0)) continue;
      const y = this.hasY ? (g.isEmpty(r, 1) ? null : g.get(r, 1)) : undefined;
      if (y === null) continue;
      const fc = this.hasFreq ? (this.hasY ? 2 : 1) : -1;
      const f = fc >= 0 && !g.isEmpty(r, fc) ? g.get(r, fc) : N.ONE;
      if (N.sign(f) < 0) throw mathError();
      out.push({ x: g.get(r, 0), y, f });
    }
    return out;
  }

  private stats(): Stats {
    if (!this.type) throw mathError();
    return computeStats(this.type, this.dataRows());
  }

  private lookup(name: string): Val | undefined {
    const def = ALL_VARS.find((v) => v.id === name);
    if (!def) return undefined;
    const s = this.stats();
    if (name === 'n') return s.n;
    if (N.isZero(s.n)) throw mathError();
    return def.get(s);
  }

  private extraFn(name: string, args: Val[]): Val | undefined {
    if (name === 'P' || name === 'Qf' || name === 'R' || name === 't') {
      if (args.length !== 1) throw argError();
      const a = args[0];
      if (a.t !== 'x' && a.t !== 'a') throw mathError();
      if (name === 't') {
        const s = this.stats();
        if (N.isZero(s.n)) throw mathError();
        return N.div(N.sub(a, s.meanX), s.sigmaX());
      }
      const d = N.toDec(a);
      return N.na(name === 'P' ? stdPhi(d) : name === 'Qf' ? stdQ(d) : stdR(d));
    }
    if (name !== 'xhat' && name !== 'xhat1' && name !== 'xhat2' && name !== 'yhat') return undefined;
    if (args.length !== 1) throw argError();
    const a = args[0];
    if (a.t !== 'x' && a.t !== 'a') throw mathError();
    const s = this.stats();
    if (N.isZero(s.n)) throw mathError();
    if (name === 'yhat') return s.yhat(a);
    return s.xhat(a, name === 'xhat2' ? 2 : 1);
  }

  // ------------------------------------------------------------ menus

  enter(): void {
    this.calc.openMenu({
      title: 'STAT',
      items: STAT_TYPES.map((t, i) => ({ label: `${i + 1}:${t.label}` })),
      sel: this.type ? STAT_TYPES.findIndex((t) => t.id === this.type) : 0,
      digits: 'index',
      pick: (i) => this.setType(STAT_TYPES[i].id),
    });
  }

  private setType(t: StatType): void {
    this.type = t;
    this.view = 'editor';
    this.configureGrid();
  }

  private configureGrid(): void {
    const old = this.grid.cells;
    this.grid.resize(this.hasY ? CAP_2 : CAP_1, this.cols);
    // keep the X/Y data when the shape changed
    void old;
    this.grid.sel = { r: 0, c: 0 };
  }

  private openStatMenu(): void {
    if (!this.type) return;
    const calc = this.calc;
    if (this.view === 'editor') {
      calc.openMenu({
        title: 'STAT',
        items: [{ label: '1:Type' }, { label: '2:Edit' }],
        sel: 0,
        digits: 'index',
        pick: (i) => {
          if (i === 0) this.enter();
          else
            calc.openMenu({
              title: 'Edit',
              items: [{ label: '1:Ins' }, { label: '2:Del' }, { label: '3:Del-All' }],
              sel: 0,
              digits: 'index',
              pick: (j) => this.edit(j),
            });
        },
      });
      return;
    }
    const two = this.hasY;
    const items = [{ label: '1:Type' }, { label: '2:Data' }, { label: '3:Sum' }, { label: '4:Var' }, { label: '5:MinMax' }];
    items.push({ label: two ? '6:Reg' : '6:Distr' });
    calc.openMenu({
      title: 'STAT',
      items,
      sel: 0,
      digits: 'index',
      pick: (i) => {
        const sub = (title: string, defs: VarDef[]) =>
          calc.openMenu({
            title,
            items: defs.map((d, k) => ({ label: `${(k + 1) % 10}:${d.label}` })),
            sel: 0,
            digits: 'index',
            pick: (k) => this.pad.handle(`tok:${defs[k].id}`),
          });
        switch (i) {
          case 0:
            this.enter();
            break;
          case 1:
            this.view = 'editor';
            break;
          case 2:
            sub('Sum', two ? SUM_VARS : SUM_VARS.slice(0, 2));
            break;
          case 3:
            sub('Var', two ? VAR_VARS : VAR_VARS.slice(0, 4));
            break;
          case 4:
            sub('MinMax', two ? MM_VARS.slice(0, 4) : [MM_VARS[0], MM_VARS[4], MM_VARS[5], MM_VARS[6], MM_VARS[1]]);
            break;
          case 5: {
            if (!two) {
              calc.openMenu({
                title: 'Distr',
                items: [{ label: '1:P(' }, { label: '2:Q(' }, { label: '3:R(' }, { label: '4:t' }],
                sel: 0,
                digits: 'index',
                pick: (k) => this.pad.handle(`tok:${['P(', 'Q(', 'R(', 't('][k]}`),
              });
              break;
            }
            const t = this.type!;
            const defs: VarDef[] = t === 'quad' ? [REG_VARS[0], REG_VARS[1], REG_VARS[2]] : t === 'lin' || t === 'ln' || t === 'inv' ? [REG_VARS[0], REG_VARS[1], REG_VARS[3]] : [REG_VARS[0], REG_VARS[1], REG_VARS[3]];
            const fns = t === 'quad' ? ['x̂1(', 'x̂2(', 'ŷ('] : ['x̂(', 'ŷ('];
            calc.openMenu({
              title: 'Reg',
              items: [...defs.map((d, k) => ({ label: `${k + 1}:${d.label}` })), ...fns.map((f, k) => ({ label: `${defs.length + k + 1}:${f}` }))],
              sel: 0,
              digits: 'index',
              pick: (k) => {
                if (k < defs.length) this.pad.handle(`tok:${defs[k].id}`);
                else this.pad.handle(`tok:${fns[k - defs.length]}`);
              },
            });
            break;
          }
        }
      },
    });
  }

  private edit(what: number): void {
    const g = this.grid;
    const r = g.sel.r;
    if (what === 0) {
      g.cells.splice(r, 0, Array.from({ length: g.cols }, () => null));
      g.cells.pop();
    } else if (what === 1) {
      g.cells.splice(r, 1);
      g.cells.push(Array.from({ length: g.cols }, () => null));
    } else {
      g.cells = g.cells.map((row) => row.map(() => null));
      g.sel = { r: 0, c: 0 };
    }
  }

  // ------------------------------------------------------------ keys

  handle(cmd: string): boolean {
    if (!this.type) return true;
    if (cmd === 'stat') {
      this.openStatMenu();
      return true;
    }
    if (this.view === 'calc') return this.pad.handle(cmd);
    const g = this.grid;
    if (cmd === 'ac' && !g.ed && !g.error) {
      this.view = 'calc';
      this.pad.handle('ac');
      return true;
    }
    if (cmd === 'del' && !g.ed && !g.error) {
      this.edit(1);
      return true;
    }
    g.advance = 'down';
    g.handle(cmd);
    return true;
  }

  currentValue(): Val | null {
    return this.view === 'calc' ? this.pad.evalCurrent() : this.calc.ctx.ans;
  }

  // ------------------------------------------------------------ screen

  screen(): ModeScreen {
    const status = { mode: 'STAT' };
    if (!this.type) return { rows: [{ t: 'line', text: 'STAT' }], status };
    if (this.view === 'calc') {
      const r = this.pad.rows();
      return { rows: r.rows, cursorRow: r.cursorRow, status: { ...status, up: this.pad.hist.length > 0, down: this.pad.histPos >= 0 } };
    }
    const g = this.grid;
    const labels = ['x', ...(this.hasY ? ['y'] : []), ...(this.hasFreq ? ['FREQ'] : [])];
    const w = Math.floor(100 / (g.cols + 1));
    const rows: Row[] = [{ t: 'cells', cells: [{ text: '', w }, ...labels.map((l) => ({ text: l, w }))] }];
    const visible = 2;
    const top = Math.min(Math.max(0, g.sel.r - (visible - 1)), g.rows - visible);
    for (let r = top; r < top + visible; r++) {
      const cells: { text: string; inv?: boolean; cursor?: boolean; w?: number }[] = [{ text: String(r + 1), w }];
      for (let c = 0; c < g.cols; c++) {
        const isSel = r === g.sel.r && c === g.sel.c;
        cells.push({ text: g.ed && isSel ? '' : g.cellText(r, c, 9), inv: isSel && !g.ed, cursor: isSel && !!g.ed, w });
      }
      rows.push({ t: 'cells', cells });
    }
    const name = `${labels[g.sel.c]}${g.sel.r + 1}=`;
    if (g.error) rows.push({ t: 'line', text: g.error.message });
    else rows.push({ t: 'expr', node: row(text(name), g.detailNode()) });
    return { rows, cursorRow: g.ed ? rows.length - 1 : undefined, status: { ...status, up: top > 0, down: top + visible < g.rows } };
  }

  // ------------------------------------------------------------ persistence

  serialize(): unknown {
    return {
      type: this.type,
      view: this.view,
      cells: this.grid.cells.map((r) => r.map((v) => (v ? numToJ(v) : null))),
      pad: this.pad.serialize(),
    };
  }
  restore(j: unknown): void {
    const o = j as { type?: StatType; view?: 'editor' | 'calc'; cells?: (Record<string, unknown> | null)[][]; pad?: unknown };
    if (!o?.type) return;
    this.type = o.type;
    this.view = o.view ?? 'editor';
    this.configureGrid();
    o.cells?.forEach((r, ri) => r.forEach((v, ci) => v && ri < this.grid.rows && ci < this.grid.cols && this.grid.set(ri, ci, numFromJ(v))));
    if (o.pad) this.pad.restore(o.pad);
  }
}

registerMode('STAT', (c) => new StatController(c));
