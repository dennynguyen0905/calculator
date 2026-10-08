// INEQ mode: polynomial inequalities of degree 2-4  (a x^n + ... ▯ 0)  with exact interval endpoints.

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { D } from '../dec';
import * as C from '../complex';
import { CalcError, mathError } from '../errors';
import { evalItems } from '../evaluator';
import { row, text, type RNode } from '../format/rnode';
import { numNode } from '../format/value';
import { CellGrid } from '../grid';
import type { Slot } from '../items';
import * as N from '../num';
import type { Num } from '../num';
import { solvePolynomial } from '../poly';
import type { Row } from '../screen';
import { numFromJ, numToJ } from '../serialize';

export type Rel = '>' | '<' | '≥' | '≤';
const RELS: Rel[] = ['>', '<', '≥', '≤'];
const COEF = ['a', 'b', 'c', 'd', 'e'];

export interface Interval {
  lo: Num | null; // null = -inf
  hi: Num | null; // null = +inf
  loIncl: boolean;
  hiIncl: boolean;
}

/** solution set of  p(x) rel 0  as a list of disjoint intervals */
export function solveInequality(co: Num[], rel: Rel): Interval[] {
  if (N.isZero(co[0])) throw mathError();
  const strict = rel === '>' || rel === '<';
  const wantPositive = rel === '>' || rel === '≥';
  // distinct real roots, ascending
  const rs = solvePolynomial(co).roots.filter((r) => !C.isCx(r)) as Num[];
  const roots: Num[] = [];
  for (const r of rs.sort((a, b) => N.cmp(a, b))) {
    const last = roots[roots.length - 1];
    if (!last || N.cmp(last, r) !== 0) roots.push(r);
  }
  const poly = (x: ReturnType<typeof N.toDec>) => {
    let acc = new D(0);
    for (const c of co) acc = acc.mul(x).add(N.toDec(c));
    return acc;
  };
  const holds = (x: ReturnType<typeof N.toDec>): boolean => {
    const v = poly(x);
    return wantPositive ? v.gt(0) : v.lt(0);
  };
  // test points: left of the first root, between roots, right of the last
  const pts: ReturnType<typeof N.toDec>[] = [];
  const dec = roots.map((r) => N.toDec(r));
  if (roots.length === 0) pts.push(new D(0));
  else {
    pts.push(dec[0].sub(1));
    for (let i = 0; i + 1 < dec.length; i++) pts.push(dec[i].add(dec[i + 1]).div(2));
    pts.push(dec[dec.length - 1].add(1));
  }
  const open: Interval[] = [];
  pts.forEach((p, i) => {
    if (holds(p)) open.push({ lo: i === 0 ? null : roots[i - 1], hi: i === roots.length ? null : roots[i], loIncl: false, hiIncl: false });
  });
  // root points themselves satisfy "= 0": included for non-strict relations
  const out: Interval[] = [];
  const addPoint = (r: Num) => out.push({ lo: r, hi: r, loIncl: true, hiIncl: true });
  const items: { start: Num | null; iv: Interval | null; pt: Num | null }[] = [];
  for (const iv of open) items.push({ start: iv.lo, iv, pt: null });
  if (!strict) for (const r of roots) items.push({ start: r, iv: null, pt: r });
  // sort by position (intervals before the point at the same start would break merging; order by lo then point)
  items.sort((a, b) => {
    if (a.start === null) return b.start === null ? 0 : -1;
    if (b.start === null) return 1;
    const c = N.cmp(a.start, b.start);
    if (c !== 0) return c;
    return a.iv ? 1 : -1; // a point at r goes before the interval starting at r
  });
  for (const it of items) {
    if (it.iv) out.push({ ...it.iv });
    else addPoint(it.pt!);
  }
  // merge touching pieces (a closed point glued to open intervals)
  const merged: Interval[] = [];
  for (const iv of out) {
    const last = merged[merged.length - 1];
    if (last && last.hi && iv.lo && N.cmp(last.hi, iv.lo) === 0 && (last.hiIncl || iv.loIncl)) {
      last.hi = iv.hi;
      last.hiIncl = iv.hiIncl;
      if (last.lo && last.hi && N.cmp(last.lo, last.hi) === 0) last.loIncl = last.hiIncl = true;
    } else merged.push({ ...iv });
  }
  return merged;
}

export function intervalNode(iv: Interval, setup: Calculator['setup'], toggled: boolean): RNode {
  const v = (n: Num) => numNode(n, setup, toggled);
  if (iv.lo && iv.hi && N.cmp(iv.lo, iv.hi) === 0) return row(text('x='), v(iv.lo));
  if (!iv.lo && !iv.hi) return text('All real numbers');
  if (!iv.lo) return row(text(iv.hiIncl ? 'x≤' : 'x<'), v(iv.hi!));
  if (!iv.hi) return row(v(iv.lo), text(iv.loIncl ? '≤x' : '<x'));
  return row(v(iv.lo), text(`${iv.loIncl ? '≤' : '<'}x${iv.hiIncl ? '≤' : '<'}`), v(iv.hi));
}

export class IneqController implements ModeController {
  degree = 2;
  rel: Rel = '>';
  grid: CellGrid;
  result: Interval[] | 'all' | 'none' | null = null;
  scroll = 0;
  toggled = false;
  err: CalcError | null = null;
  configured = false;

  constructor(private readonly calc: Calculator) {
    this.grid = new CellGrid(1, 3, calc, (items: Slot): Num => {
      calc.applySetupToCtx();
      const v = evalItems(items, calc.ctx);
      if (v.t !== 'x' && v.t !== 'a') throw mathError();
      return v;
    });
  }

  enter(): void {
    this.result = null;
    this.err = null;
    this.calc.openMenu({
      title: 'INEQ',
      items: [{ label: '1:ax²+bx+c▯0' }, { label: '2:ax³+bx²+cx+d▯0' }, { label: '3:ax⁴+bx³+...▯0' }],
      sel: this.degree - 2,
      digits: 'index',
      pick: (d) => {
        this.calc.openMenu({
          title: 'Relation',
          items: [{ label: '1:▯>0' }, { label: '2:▯<0' }, { label: '3:▯≥0' }, { label: '4:▯≤0' }],
          sel: RELS.indexOf(this.rel),
          digits: 'index',
          pick: (r) => {
            this.degree = d + 2;
            this.rel = RELS[r];
            this.configured = true;
            this.grid.resize(1, this.degree + 1);
            this.grid.sel = { r: 0, c: 0 };
          },
        });
      },
    });
  }

  private solve(): void {
    try {
      const co = Array.from({ length: this.grid.cols }, (_, c) => this.grid.get(0, c));
      const ivs = solveInequality(co, this.rel);
      if (ivs.length === 0) this.result = 'none';
      else if (ivs.length === 1 && !ivs[0].lo && !ivs[0].hi) this.result = 'all';
      else this.result = ivs;
      this.scroll = 0;
      this.toggled = false;
      this.err = null;
    } catch (e) {
      if (e instanceof CalcError) this.err = e;
      else throw e;
    }
  }

  handle(cmd: string): boolean {
    if (!this.configured) return true;
    if (this.err) {
      if (cmd === 'ac') this.err = null;
      return true;
    }
    if (this.result) {
      const n = Array.isArray(this.result) ? this.result.length : 1;
      switch (cmd) {
        case 'up':
          if (this.scroll > 0) this.scroll--;
          return true;
        case 'down':
        case 'eq':
          if (this.scroll < n - 2) this.scroll++;
          else if (cmd === 'eq') this.result = null;
          return true;
        case 'sd':
          this.toggled = !this.toggled;
          return true;
        case 'ac':
          this.result = null;
          return true;
        default:
          return true;
      }
    }
    const g = this.grid;
    const last = g.sel.c === g.cols - 1;
    if (cmd === 'eq' && last) {
      g.handle('eq');
      g.sel = { r: 0, c: g.cols - 1 };
      if (!g.error) this.solve();
      return true;
    }
    g.handle(cmd);
    return true;
  }

  screen(): ModeScreen {
    const status = { mode: 'INEQ' };
    if (!this.configured) return { rows: [{ t: 'line', text: 'INEQ' }], status };
    if (this.err) {
      return {
        rows: [{ t: 'line', text: this.err.message }, { t: 'line', text: '' }, { t: 'line', text: '[AC]  :Cancel', dim: true }, { t: 'line', text: '[◀][▶]:Goto', dim: true }],
        status,
      };
    }
    if (this.result) {
      if (this.result === 'all') return { rows: [{ t: 'expr', node: text('All real numbers') }], status };
      if (this.result === 'none') return { rows: [{ t: 'expr', node: text('No solution') }], status };
      const rows: Row[] = this.result.slice(this.scroll, this.scroll + 2).map((iv) => ({ t: 'expr', node: intervalNode(iv, this.calc.setup, this.toggled) }));
      return { rows, status: { ...status, up: this.scroll > 0, down: this.scroll < this.result.length - 2 } };
    }
    const g = this.grid;
    const w = Math.floor(100 / (g.cols + 1));
    const rows: Row[] = [];
    rows.push({ t: 'cells', cells: [{ text: `▯${this.rel}0`, w }, ...Array.from({ length: g.cols }, (_, c) => ({ text: COEF[c], w }))] });
    const cells: { text: string; inv?: boolean; cursor?: boolean; w?: number }[] = [{ text: '', w }];
    for (let c = 0; c < g.cols; c++) {
      const isSel = c === g.sel.c;
      cells.push({ text: g.ed && isSel ? '' : g.cellText(0, c, 6), inv: isSel && !g.ed, cursor: isSel && !!g.ed, w });
    }
    rows.push({ t: 'cells', cells });
    if (g.error) rows.push({ t: 'line', text: g.error.message });
    else rows.push({ t: 'expr', node: row(text(`${COEF[g.sel.c]}=`), g.detailNode()) });
    return { rows, cursorRow: g.ed ? rows.length - 1 : undefined, status };
  }

  serialize(): unknown {
    return { degree: this.degree, rel: this.rel, configured: this.configured, cells: this.grid.cells[0].map((v) => (v ? numToJ(v) : null)) };
  }
  restore(j: unknown): void {
    const o = j as { degree?: number; rel?: Rel; configured?: boolean; cells?: (Record<string, unknown> | null)[] };
    if (!o?.degree) return;
    this.degree = o.degree;
    this.rel = o.rel ?? '>';
    this.configured = !!o.configured;
    this.grid.resize(1, this.degree + 1);
    o.cells?.forEach((v, i) => v && this.grid.set(0, i, numFromJ(v)));
  }
}

registerMode('INEQ', (c) => new IneqController(c));
