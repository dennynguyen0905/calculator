// SPREADSHEET mode: 5 columns (A-E) x 45 rows. Cells hold numbers or formulas ("=A1+B1*2", "=SUM(A1:A5)").

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { CalcError, mathError, syntaxError } from '../errors';
import { evalItems, type EvalCtx, type Val } from '../evaluator';
import { renderItems } from '../editor/render';
import { row, text } from '../format/rnode';
import { shortNum } from '../grid';
import { ExprLine } from '../exprline';
import type { Item, Slot } from '../items';
import * as N from '../num';
import type { Num } from '../num';
import { numNode } from '../format/value';
import { parse } from '../parser';
import type { Row } from '../screen';
import { numFromJ, numToJ } from '../serialize';

const COLS = 5;
const ROWS = 45;
const COL_NAMES = ['A', 'B', 'C', 'D', 'E'];

type CellData = { n: Num } | { f: Slot } | null;

const refOf = (col: number, r: number): string => `${COL_NAMES[col]}${r + 1}`;
function parseRef(id: string): { col: number; r: number } | null {
  const m = /^([A-E])(\d{1,2})$/.exec(id);
  if (!m) return null;
  const r = Number(m[2]);
  if (r < 1 || r > ROWS) return null;
  return { col: COL_NAMES.indexOf(m[1]), r: r - 1 };
}

/** merge "A" "1" "2" into a single reference item and expand "A1:A3" ranges into "A1,A2,A3" */
export function expandRefs(items: Slot): Slot {
  // pass 1: merge letter + digits
  const merged: Item[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.k === 'c' && /^[A-E]$/.test(it.s) && items[i + 1]?.k === 'c' && /^[0-9]$/.test((items[i + 1] as { s: string }).s)) {
      let digits = '';
      let j = i + 1;
      while (j < items.length && digits.length < 2 && items[j].k === 'c' && /^[0-9]$/.test((items[j] as { s: string }).s)) {
        digits += (items[j] as { s: string }).s;
        j++;
      }
      // prefer the two-digit reading only if it is a valid row
      let ref = it.s + digits;
      if (!parseRef(ref) && digits.length === 2) {
        ref = it.s + digits[0];
        j--;
      }
      merged.push({ k: 'c', s: ref });
      i = j - 1;
    } else if (it.k === 'c') {
      merged.push(it);
    } else {
      merged.push(mapStruct(it));
    }
  }
  // pass 2: ranges
  const out: Item[] = [];
  for (let i = 0; i < merged.length; i++) {
    const a = merged[i];
    const colon = merged[i + 1];
    const b = merged[i + 2];
    if (a.k === 'c' && colon?.k === 'c' && colon.s === ':' && b?.k === 'c') {
      const ra = parseRef(a.s);
      const rb = parseRef(b.s);
      if (ra && rb) {
        const [c0, c1] = [Math.min(ra.col, rb.col), Math.max(ra.col, rb.col)];
        const [r0, r1] = [Math.min(ra.r, rb.r), Math.max(ra.r, rb.r)];
        let first = true;
        for (let c = c0; c <= c1; c++) {
          for (let r = r0; r <= r1; r++) {
            if (!first) out.push({ k: 'c', s: ',' });
            out.push({ k: 'c', s: refOf(c, r) });
            first = false;
          }
        }
        i += 2;
        continue;
      }
    }
    out.push(a);
  }
  return out;
}

function mapStruct(it: Item): Item {
  const o: Record<string, unknown> = { ...(it as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(o)) if (Array.isArray(v)) o[k] = expandRefs(v as Slot);
  return o as unknown as Item;
}

export class SpreadController implements ModeController {
  cells: CellData[][] = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  sel = { r: 0, c: 0 };
  line: ExprLine;
  editing = false;
  err: CalcError | null = null;

  constructor(private readonly calc: Calculator) {
    this.line = new ExprLine(calc);
  }

  // ------------------------------------------------------------ evaluation

  private ctxFor(visiting: Set<string>): EvalCtx {
    return {
      ...this.calc.ctx,
      lookup: (name) => {
        const ref = parseRef(name);
        return ref ? this.valueAt(ref.col, ref.r, visiting) : undefined;
      },
      extraFn: (name, args) => {
        if (!['SUM', 'MEAN', 'MAX', 'MIN', 'COUNT'].includes(name)) return undefined;
        const nums: Num[] = args.map((a) => {
          if (a.t !== 'x' && a.t !== 'a') throw mathError();
          return a;
        });
        if (nums.length === 0) throw syntaxError();
        switch (name) {
          case 'SUM':
            return nums.reduce((x, y) => N.add(x, y), N.ZERO);
          case 'MEAN':
            return N.div(
              nums.reduce((x, y) => N.add(x, y), N.ZERO),
              N.fromInt(nums.length),
            );
          case 'MAX':
            return N.minMax(nums, true);
          case 'MIN':
            return N.minMax(nums, false);
          default:
            return N.fromInt(nums.length);
        }
      },
    };
  }

  private valueAt(col: number, r: number, visiting: Set<string>): Num {
    const cell = this.cells[r][col];
    if (!cell) return N.ZERO;
    if ('n' in cell) return cell.n;
    const key = refOf(col, r);
    if (visiting.has(key)) throw new CalcError('Circular');
    visiting.add(key);
    try {
      this.calc.applySetupToCtx();
      const v: Val = evalItems(expandRefs(cell.f), this.ctxFor(visiting));
      if (v.t !== 'x' && v.t !== 'a') throw mathError();
      return v;
    } finally {
      visiting.delete(key);
    }
  }

  private safeValue(col: number, r: number): Num | null {
    try {
      return this.valueAt(col, r, new Set());
    } catch (e) {
      if (e instanceof CalcError) return null;
      throw e;
    }
  }

  // ------------------------------------------------------------ editing

  private commit(): void {
    const items = this.line.items;
    this.editing = false;
    if (items.length === 0) {
      this.line.clear();
      return;
    }
    const isFormula = items[0].k === 'c' && (items[0] as { s: string }).s === '=';
    try {
      if (isFormula) {
        const body = JSON.parse(JSON.stringify(items.slice(1))) as Slot;
        parse(expandRefs(body)); // syntax check
        this.cells[this.sel.r][this.sel.c] = { f: body };
      } else {
        this.calc.applySetupToCtx();
        const v = evalItems(expandRefs(items), this.ctxFor(new Set()));
        if (v.t !== 'x' && v.t !== 'a') throw mathError();
        this.cells[this.sel.r][this.sel.c] = { n: v };
      }
      this.err = null;
      this.line.clear();
      if (this.sel.r < ROWS - 1) this.sel.r++;
    } catch (e) {
      if (e instanceof CalcError) {
        this.err = e;
        this.editing = true;
      } else throw e;
    }
  }

  handle(cmd: string): boolean {
    if (this.err) {
      if (cmd === 'ac') {
        this.err = null;
        this.editing = false;
        this.line.clear();
      }
      return true;
    }
    if (cmd === 'stat') {
      this.calc.openMenu({
        title: 'SHEET',
        items: [{ label: '1:SUM(' }, { label: '2:MEAN(' }, { label: '3:MAX(' }, { label: '4:MIN(' }, { label: '5:COUNT(' }, { label: '6:Del-All' }],
        sel: 0,
        digits: 'index',
        pick: (i) => {
          if (i === 5) {
            this.cells = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
            return;
          }
          if (!this.editing) {
            this.editing = true;
            this.line.clear();
            this.line.handle('equal');
          }
          this.line.handle(`tok:${['SUM(', 'MEAN(', 'MAX(', 'MIN(', 'COUNT('][i]}`);
        },
      });
      return true;
    }
    if (this.editing) {
      const r = this.line.handle(cmd);
      if (r === 'enter') this.commit();
      else if (r === 'cancel') {
        this.editing = false;
        this.line.clear();
      }
      return true;
    }
    switch (cmd) {
      case 'left':
        if (this.sel.c > 0) this.sel.c--;
        return true;
      case 'right':
        if (this.sel.c < COLS - 1) this.sel.c++;
        return true;
      case 'up':
        if (this.sel.r > 0) this.sel.r--;
        return true;
      case 'down':
      case 'eq':
        if (this.sel.r < ROWS - 1) this.sel.r++;
        return true;
      case 'del':
      case 'ac':
        if (cmd === 'del') this.cells[this.sel.r][this.sel.c] = null;
        return true;
      default:
        break;
    }
    // start typing into the selected cell
    this.line.clear();
    this.editing = true;
    const r = this.line.handle(cmd);
    if (r === false) this.editing = false;
    else if (r === 'enter' || r === 'cancel') this.editing = false;
    return true;
  }

  // ------------------------------------------------------------ screen

  screen(): ModeScreen {
    const status = { mode: 'SHEET' };
    if (this.err) {
      return { rows: [{ t: 'line', text: this.err.message }, { t: 'line', text: '' }, { t: 'line', text: '[AC]  :Cancel', dim: true }], status };
    }
    const w = Math.floor(100 / (COLS + 1));
    const rows: Row[] = [{ t: 'cells', cells: [{ text: '', w }, ...COL_NAMES.map((n) => ({ text: n, w }))] }];
    const visible = 2;
    const top = Math.min(Math.max(0, this.sel.r - (visible - 1)), ROWS - visible);
    for (let r = top; r < top + visible; r++) {
      const cells: { text: string; inv?: boolean; w?: number }[] = [{ text: String(r + 1), w }];
      for (let c = 0; c < COLS; c++) {
        const v = this.cells[r][c] ? this.safeValue(c, r) : null;
        const t = !this.cells[r][c] ? '' : v ? shortNum(v, 6, this.calc.setup) : 'ERROR';
        cells.push({ text: t, inv: r === this.sel.r && c === this.sel.c, w });
      }
      rows.push({ t: 'cells', cells });
    }
    const name = refOf(this.sel.c, this.sel.r);
    if (this.editing) {
      rows.push({ t: 'expr', node: row(text(`${name}:`), this.line.node()) });
      return { rows, cursorRow: rows.length - 1, status };
    }
    const cell = this.cells[this.sel.r][this.sel.c];
    let detail = row(text(`${name}:`));
    if (cell && 'f' in cell) detail = row(text(`${name}:=`), renderItems(cell.f));
    else if (cell) detail = row(text(`${name}:`), numNode(cell.n, this.calc.setup));
    rows.push({ t: 'expr', node: detail });
    return { rows, status: { ...status, up: top > 0, down: top + visible < ROWS } };
  }

  // ------------------------------------------------------------ persistence

  serialize(): unknown {
    return { cells: this.cells.map((r) => r.map((c) => (c ? ('n' in c ? { n: numToJ(c.n) } : { f: c.f }) : null))) };
  }
  restore(j: unknown): void {
    const o = j as { cells?: ({ n?: Record<string, unknown>; f?: Slot } | null)[][] };
    o?.cells?.forEach((r, ri) =>
      r.forEach((c, ci) => {
        if (ri >= ROWS || ci >= COLS || !c) return;
        this.cells[ri][ci] = c.n ? { n: numFromJ(c.n) } : c.f ? { f: c.f } : null;
      }),
    );
  }
}

registerMode('SPREAD', (c) => new SpreadController(c));
