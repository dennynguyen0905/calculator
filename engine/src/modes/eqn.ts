// EQN mode: simultaneous linear equations (2-4 unknowns) and polynomial equations (degree 2-4).

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { CalcError, mathError } from '../errors';
import { evalItems } from '../evaluator';
import { formatValue } from '../format/value';
import { row, text, type RNode } from '../format/rnode';
import { CellGrid } from '../grid';
import type { Slot } from '../items';
import type { Num } from '../num';
import { solveLinear, solvePolynomial } from '../poly';
import type { Row } from '../screen';
import { numFromJ, numToJ } from '../serialize';
import type { Val } from '../evaluator';

type Kind = 'simul' | 'poly';
interface Answer {
  label: string;
  value: Val;
}

const UNKNOWNS = ['x', 'y', 'z', 't'];
const COEF = ['a', 'b', 'c', 'd', 'e'];

export class EqnController implements ModeController {
  kind: Kind | null = null;
  size = 2;
  grid: CellGrid;
  answers: Answer[] | null = null;
  scroll = 0;
  toggled = false;
  err: CalcError | null = null;

  constructor(private readonly calc: Calculator) {
    this.grid = new CellGrid(2, 3, calc, (items: Slot): Num => {
      calc.applySetupToCtx();
      const v = evalItems(items, calc.ctx);
      if (v.t !== 'x' && v.t !== 'a') throw mathError();
      return v;
    });
  }

  enter(): void {
    this.answers = null;
    this.err = null;
    this.calc.openMenu({
      title: 'EQN',
      items: [{ label: '1:Simul Equation' }, { label: '2:Polynomial' }],
      sel: this.kind === 'poly' ? 1 : 0,
      digits: 'index',
      pick: (i) => {
        if (i === 0) {
          this.calc.openMenu({
            title: 'Unknowns?',
            items: [{ label: '1:2' }, { label: '2:3' }, { label: '3:4' }],
            sel: this.kind === 'simul' ? this.size - 2 : 0,
            digits: 'index',
            pick: (j) => this.configure('simul', j + 2),
          });
        } else {
          this.calc.openMenu({
            title: 'Degree?',
            items: [{ label: '1:2' }, { label: '2:3' }, { label: '3:4' }],
            sel: this.kind === 'poly' ? this.size - 2 : 0,
            digits: 'index',
            pick: (j) => this.configure('poly', j + 2),
          });
        }
      },
    });
  }

  private configure(kind: Kind, size: number): void {
    this.kind = kind;
    this.size = size;
    this.answers = null;
    this.err = null;
    this.scroll = 0;
    this.grid.sel = { r: 0, c: 0 };
    if (kind === 'simul') this.grid.resize(size, size + 1);
    else this.grid.resize(1, size + 1);
  }

  // ------------------------------------------------------------ solving

  private solve(): void {
    try {
      const g = this.grid;
      let answers: Answer[];
      if (this.kind === 'simul') {
        const aug: Num[][] = [];
        for (let r = 0; r < g.rows; r++) aug.push(Array.from({ length: g.cols }, (_, c) => g.get(r, c)));
        const sol = solveLinear(aug);
        answers = sol.map((v, i) => ({ label: UNKNOWNS[i], value: v }));
      } else {
        const co = Array.from({ length: g.cols }, (_, c) => g.get(0, c));
        const r = solvePolynomial(co);
        answers = r.roots.map((v, i) => ({ label: r.single ? 'x' : `x${i + 1}`, value: v }));
      }
      this.answers = answers;
      this.scroll = 0;
      this.toggled = false;
      this.err = null;
    } catch (e) {
      if (e instanceof CalcError) this.err = e;
      else throw e;
    }
  }

  // ------------------------------------------------------------ keys

  handle(cmd: string): boolean {
    if (this.kind === null) return true;
    if (this.err) {
      if (cmd === 'ac') this.err = null;
      return true;
    }
    if (this.answers) {
      switch (cmd) {
        case 'up':
          if (this.scroll > 0) this.scroll--;
          return true;
        case 'down':
          if (this.scroll < this.answers.length - 2) this.scroll++;
          return true;
        case 'eq':
          if (this.scroll < this.answers.length - 2) this.scroll++;
          else this.answers = null;
          return true;
        case 'sd':
          this.toggled = !this.toggled;
          return true;
        case 'ac':
          this.answers = null;
          return true;
        default:
          return true;
      }
    }
    const g = this.grid;
    const last = g.sel.r === g.rows - 1 && g.sel.c === g.cols - 1;
    if (cmd === 'eq' && last) {
      g.handle('eq'); // commits
      g.sel = { r: g.rows - 1, c: g.cols - 1 };
      if (!g.error) this.solve();
      return true;
    }
    g.advance = 'right';
    g.handle(cmd);
    return true;
  }

  // ------------------------------------------------------------ screen

  screen(): ModeScreen {
    const status = { mode: 'EQN' };
    if (this.kind === null) return { rows: [{ t: 'line', text: 'EQN' }], status };
    if (this.err) {
      return {
        rows: [
          { t: 'line', text: this.err.message },
          { t: 'line', text: '' },
          { t: 'line', text: '[AC]  :Cancel', dim: true },
          { t: 'line', text: '[◀][▶]:Goto', dim: true },
        ],
        status,
      };
    }
    if (this.answers) {
      const rows: Row[] = [];
      const shown = this.answers.slice(this.scroll, this.scroll + 2);
      for (const a of shown) {
        const lines = formatValue(a.value, this.calc.setup, { toggled: this.toggled }).lines;
        rows.push({ t: 'expr', node: row(text(`${a.label}=`), lines[0]) });
      }
      return { rows, status: { ...status, up: this.scroll > 0, down: this.scroll < this.answers.length - 2 } };
    }
    return this.editScreen(status);
  }

  private editScreen(status: { mode: string }): ModeScreen {
    const g = this.grid;
    const rows: Row[] = [];
    const labels: string[] = [];
    if (this.kind === 'simul') {
      for (let c = 0; c < g.cols; c++) labels.push(c < g.cols - 1 ? COEF[c] : COEF[g.cols - 1]);
    } else {
      for (let c = 0; c < g.cols; c++) labels.push(COEF[c]);
    }
    const w = Math.floor(100 / (g.cols + 1));
    const head = this.kind === 'simul' ? 'Simul' : 'Poly';
    rows.push({ t: 'cells', cells: [{ text: head, w, node: undefined }, ...labels.map((l) => ({ text: l, w }))] });
    // visible window of equation rows
    const maxVisible = this.kind === 'simul' ? 2 : 1;
    let top = 0;
    if (g.rows > maxVisible) top = Math.min(Math.max(0, g.sel.r - (maxVisible - 1)), g.rows - maxVisible);
    for (let r = top; r < Math.min(g.rows, top + maxVisible); r++) {
      const cells: { text: string; inv?: boolean; w?: number; node?: RNode; cursor?: boolean }[] = [{ text: this.kind === 'simul' ? `${r + 1}` : '', w }];
      for (let c = 0; c < g.cols; c++) {
        const isSel = r === g.sel.r && c === g.sel.c;
        cells.push({ text: g.ed && isSel ? '' : g.cellText(r, c, 6), inv: isSel && !g.ed, cursor: isSel && !!g.ed, w });
      }
      rows.push({ t: 'cells', cells });
    }
    // detail row: selected cell in natural form (or the editor)
    const name = this.kind === 'simul' ? `${COEF[g.sel.c]}${g.sel.r + 1}=` : `${COEF[g.sel.c]}=`;
    if (g.error) {
      rows.push({ t: 'line', text: g.error.message, align: 'left' });
    } else {
      rows.push({ t: 'expr', node: row(text(name), g.detailNode()) });
    }
    return { rows, cursorRow: g.ed ? rows.length - 1 : undefined, status: { ...status, up: top > 0, down: top + maxVisible < g.rows } };
  }

  // ------------------------------------------------------------ persistence

  serialize(): unknown {
    return {
      kind: this.kind,
      size: this.size,
      cells: this.grid.cells.map((r) => r.map((v) => (v ? numToJ(v) : null))),
    };
  }
  restore(j: unknown): void {
    const o = j as { kind?: Kind; size?: number; cells?: (Record<string, unknown> | null)[][] };
    if (!o?.kind || !o.size) return;
    this.configure(o.kind, o.size);
    o.cells?.forEach((r, ri) => r.forEach((v, ci) => v && this.grid.set(ri, ci, numFromJ(v))));
  }
}

registerMode('EQN', (c) => new EqnController(c));
