// RATIO mode: solve  a : b = X : d   or   a : b = c : X.

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { CalcError, mathError } from '../errors';
import { evalItems } from '../evaluator';
import { row, text } from '../format/rnode';
import { numNode } from '../format/value';
import { CellGrid } from '../grid';
import type { Slot } from '../items';
import * as N from '../num';
import type { Num } from '../num';
import type { Row } from '../screen';
import { numFromJ, numToJ } from '../serialize';

const LABELS = [
  ['a', 'b', 'd'],
  ['a', 'b', 'c'],
];

export class RatioController implements ModeController {
  type = -1;
  grid: CellGrid;
  result: Num | null = null;
  err: CalcError | null = null;

  constructor(private readonly calc: Calculator) {
    this.grid = new CellGrid(3, 1, calc, (items: Slot): Num => {
      calc.applySetupToCtx();
      const v = evalItems(items, calc.ctx);
      if (v.t !== 'x' && v.t !== 'a') throw mathError();
      return v;
    });
    this.grid.advance = 'down';
  }

  enter(): void {
    this.result = null;
    this.err = null;
    this.calc.openMenu({
      title: 'RATIO',
      items: [{ label: '1:a:b=X:d' }, { label: '2:a:b=c:X' }],
      sel: Math.max(0, this.type),
      digits: 'index',
      pick: (i) => {
        this.type = i;
        this.grid.sel = { r: 0, c: 0 };
      },
    });
  }

  private solve(): void {
    const [a, b, z] = [0, 1, 2].map((r) => this.grid.get(r, 0));
    try {
      // a : b = X : d  =>  X = a d / b ;   a : b = c : X  =>  X = b c / a
      this.result = this.type === 0 ? N.div(N.mul(a, z), b) : N.div(N.mul(b, z), a);
      this.err = null;
    } catch (e) {
      if (e instanceof CalcError) this.err = e;
      else throw e;
    }
  }

  handle(cmd: string): boolean {
    if (this.type < 0) return true;
    if (this.err) {
      if (cmd === 'ac') this.err = null;
      return true;
    }
    if (this.result) {
      if (cmd === 'ac' || cmd === 'eq') this.result = null;
      return true;
    }
    const g = this.grid;
    if (cmd === 'eq' && g.sel.r === g.rows - 1) {
      g.handle('eq');
      g.sel = { r: g.rows - 1, c: 0 };
      if (!g.error) this.solve();
      return true;
    }
    g.handle(cmd);
    return true;
  }

  screen(): ModeScreen {
    const status = { mode: 'RATIO' };
    if (this.type < 0) return { rows: [{ t: 'line', text: 'RATIO' }], status };
    if (this.err) return { rows: [{ t: 'line', text: this.err.message }, { t: 'line', text: '' }, { t: 'line', text: '[AC]  :Cancel', dim: true }], status };
    if (this.result) return { rows: [{ t: 'expr', node: row(text('X='), numNode(this.result, this.calc.setup)) }], status };
    const g = this.grid;
    const rows: Row[] = [{ t: 'line', text: this.type === 0 ? 'a:b=X:d' : 'a:b=c:X', title: true }];
    LABELS[this.type].forEach((l, r) => {
      const isSel = r === g.sel.r;
      rows.push({
        t: 'cells',
        cells: [
          { text: `${l}=`, w: 30 },
          { text: g.ed && isSel ? '' : g.cellText(r, 0, 12), inv: isSel && !g.ed, cursor: isSel && !!g.ed, node: g.ed && isSel ? g.detailNode() : undefined, w: 70 },
        ],
      });
    });
    return { rows, cursorRow: g.ed ? 1 + g.sel.r : undefined, status };
  }

  serialize(): unknown {
    return { type: this.type, cells: this.grid.cells.map((r) => (r[0] ? numToJ(r[0]) : null)) };
  }
  restore(j: unknown): void {
    const o = j as { type?: number; cells?: (Record<string, unknown> | null)[] };
    if (o?.type === undefined || o.type < 0) return;
    this.type = o.type;
    o.cells?.forEach((v, i) => v && this.grid.set(i, 0, numFromJ(v)));
  }
}

registerMode('RATIO', (c) => new RatioController(c));
