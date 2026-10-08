// CellGrid: a table of numeric cells edited with the same expression editor as the main pad.
// Used by EQN coefficients, STAT data, MATRIX / VECTOR data, Ratio, Spreadsheet, TABLE ranges ...

import { CalcError } from './errors';
import {
  deleteBack,
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  newEditor,
  type Editor,
} from './editor/editor';
import { renderEditor } from './editor/render';
import { decimalString } from './format/decimal';
import type { RNode } from './format/rnode';
import { numNode } from './format/value';
import { applyInsert, isInsertCmd } from './inputcmds';
import type { Slot } from './items';
import * as N from './num';
import type { Num } from './num';
import type { Setup } from './settings';

export interface GridHost {
  setup: Setup;
  takeHyp(): boolean;
}

export class CellGrid {
  cells: (Num | null)[][] = [];
  sel = { r: 0, c: 0 };
  ed: Editor | null = null;
  error: CalcError | null = null;
  /** set when AC is pressed while not editing */
  exitRequested = false;
  /** which way "=" advances after committing a cell */
  advance: 'right' | 'down' = 'right';

  constructor(
    public rows: number,
    public cols: number,
    private readonly host: GridHost,
    private readonly evalCell: (items: Slot) => Num,
  ) {
    this.resize(rows, cols);
  }

  resize(rows: number, cols: number): void {
    const old = this.cells;
    this.cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => old[r]?.[c] ?? null));
    this.rows = rows;
    this.cols = cols;
    this.sel = { r: Math.min(this.sel.r, rows - 1), c: Math.min(this.sel.c, cols - 1) };
    this.ed = null;
  }

  get(r: number, c: number): Num {
    return this.cells[r]?.[c] ?? N.ZERO;
  }
  set(r: number, c: number, v: Num | null): void {
    if (this.cells[r]) this.cells[r][c] = v;
  }
  isEmpty(r: number, c: number): boolean {
    return this.cells[r]?.[c] == null;
  }

  private commit(): boolean {
    if (!this.ed) return true;
    if (this.ed.root.length === 0) {
      this.ed = null;
      return true;
    }
    try {
      this.cells[this.sel.r][this.sel.c] = this.evalCell(this.ed.root);
      this.ed = null;
      this.error = null;
      return true;
    } catch (e) {
      if (e instanceof CalcError) {
        this.error = e;
        return false;
      }
      throw e;
    }
  }

  private move(dr: number, dc: number, wrap = false): void {
    let { r, c } = this.sel;
    c += dc;
    r += dr;
    if (wrap) {
      if (c >= this.cols) {
        c = 0;
        r++;
      } else if (c < 0) {
        c = this.cols - 1;
        r--;
      }
    }
    this.sel = { r: Math.min(Math.max(r, 0), this.rows - 1), c: Math.min(Math.max(c, 0), this.cols - 1) };
  }

  /** returns true if the command was handled */
  handle(cmd: string): boolean {
    this.exitRequested = false;
    if (this.error) {
      if (cmd === 'ac') this.error = null;
      return true;
    }
    switch (cmd) {
      case 'eq':
        if (!this.commit()) return true;
        if (this.advance === 'right') this.move(0, 1, true);
        else this.move(1, 0);
        return true;
      case 'left':
        if (this.ed && moveLeft(this.ed)) return true;
        if (!this.commit()) return true;
        this.move(0, -1);
        return true;
      case 'right':
        if (this.ed && moveRight(this.ed)) return true;
        if (!this.commit()) return true;
        this.move(0, 1);
        return true;
      case 'up':
        if (this.ed && moveUp(this.ed)) return true;
        if (!this.commit()) return true;
        this.move(-1, 0);
        return true;
      case 'down':
        if (this.ed && moveDown(this.ed)) return true;
        if (!this.commit()) return true;
        this.move(1, 0);
        return true;
      case 'del':
        if (this.ed) deleteBack(this.ed);
        else this.cells[this.sel.r][this.sel.c] = null;
        return true;
      case 'ac':
        if (this.ed) this.ed = null;
        else this.exitRequested = true;
        return true;
      default:
        break;
    }
    if (isInsertCmd(cmd)) {
      if (!this.ed) this.ed = newEditor();
      applyInsert(this.ed, cmd, this.host.takeHyp(), this.host.setup.io === 'line');
      return true;
    }
    return false;
  }

  /** short plain text for a stored value (fits in `width` characters) */
  cellText(r: number, c: number, width: number): string {
    if (this.ed && r === this.sel.r && c === this.sel.c) return '';
    const v = this.cells[r]?.[c];
    if (v == null) return '';
    return shortNum(v, width, this.host.setup);
  }

  /** full natural display of the selected cell, or the editor while typing */
  detailNode(): RNode {
    if (this.ed) return renderEditor(this.ed);
    const v = this.cells[this.sel.r]?.[this.sel.c];
    return numNode(v ?? N.ZERO, this.host.setup);
  }
}

/** compact decimal / integer text no longer than `width` characters */
export function shortNum(v: Num, width: number, setup: Setup): string {
  const d = N.toDec(v);
  for (let sig = 10; sig >= 1; sig--) {
    const s = decimalString(d.toSignificantDigits(sig), { fmt: { kind: 'norm1', n: 0 }, mark: setup.decimalMark });
    if (s.length <= width) return s;
  }
  return decimalString(d, { fmt: { kind: 'sci', n: 2 }, mark: setup.decimalMark });
}
