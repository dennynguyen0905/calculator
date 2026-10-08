// DIST mode: normal, binomial and Poisson distributions (PD, CD and inverse).

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { D } from '../dec';
import * as Dist from '../dist';
import { CalcError, mathError } from '../errors';
import { evalItems } from '../evaluator';
import { row, text } from '../format/rnode';
import { renderEditor } from '../editor/render';
import { numNode } from '../format/value';
import { CellGrid } from '../grid';
import type { Slot } from '../items';
import * as N from '../num';
import type { Num } from '../num';
import type { Row } from '../screen';
import { numFromJ, numToJ } from '../serialize';

interface Field {
  label: string;
  /** default used when the cell is left empty */
  def?: string;
}
interface Out {
  label: string;
  v: Num;
}
interface DistDef {
  title: string;
  fields: Field[];
  run(v: ReturnType<typeof N.toDec>[], tail: Dist.Tail): Out[];
}

const na = N.na;
type DecT = ReturnType<typeof N.toDec>;

export const DISTS: DistDef[] = [
  {
    title: 'Normal PD',
    fields: [{ label: 'x' }, { label: 'σ', def: '1' }, { label: 'μ', def: '0' }],
    run: ([x, s, m]) => [{ label: 'p', v: na(Dist.normalPdf(x, m, s)) }],
  },
  {
    title: 'Normal CD',
    fields: [{ label: 'Lower', def: '-1E99' }, { label: 'Upper', def: '1E99' }, { label: 'σ', def: '1' }, { label: 'μ', def: '0' }],
    run: ([lo, hi, s, m]) => {
      const r = Dist.normalCdf(lo, hi, m, s);
      return [
        { label: 'p', v: na(r.p) },
        { label: 'ZLow', v: na(r.zlow) },
        { label: 'ZUp', v: na(r.zup) },
      ];
    },
  },
  {
    title: 'Inverse Normal',
    fields: [{ label: 'Area' }, { label: 'σ', def: '1' }, { label: 'μ', def: '0' }],
    run: ([a, s, m], tail) => {
      const xs = Dist.inverseNormal(a, m, s, tail);
      return xs.length === 1 ? [{ label: 'xInv', v: na(xs[0]) }] : xs.map((x, i) => ({ label: `x${i + 1}Inv`, v: na(x) }));
    },
  },
  {
    title: 'Binomial PD',
    fields: [{ label: 'x' }, { label: 'N' }, { label: 'p' }],
    run: ([x, n, p]) => [{ label: 'p', v: na(Dist.binomialPd(x, n, p)) }],
  },
  {
    title: 'Binomial CD',
    fields: [{ label: 'x' }, { label: 'N' }, { label: 'p' }],
    run: ([x, n, p]) => [{ label: 'p', v: na(Dist.binomialCdf(x, n, p)) }],
  },
  {
    title: 'Inverse Binomial',
    fields: [{ label: 'Area' }, { label: 'N' }, { label: 'p' }],
    run: ([a, n, p]) => [{ label: 'x', v: na(Dist.inverseBinomial(a, n, p)) }],
  },
  {
    title: 'Poisson PD',
    fields: [{ label: 'x' }, { label: 'μ' }],
    run: ([x, m]) => [{ label: 'p', v: na(Dist.poissonPd(x, m)) }],
  },
  {
    title: 'Poisson CD',
    fields: [{ label: 'x' }, { label: 'μ' }],
    run: ([x, m]) => [{ label: 'p', v: na(Dist.poissonCdf(x, m)) }],
  },
  {
    title: 'Inverse Poisson',
    fields: [{ label: 'Area' }, { label: 'μ' }],
    run: ([a, m]) => [{ label: 'x', v: na(Dist.inversePoisson(a, m)) }],
  },
];

export class DistController implements ModeController {
  kind = -1;
  tail: Dist.Tail = 'left';
  grid: CellGrid;
  out: Out[] | null = null;
  scroll = 0;
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
    this.out = null;
    this.err = null;
    this.calc.openMenu({
      title: 'DIST',
      items: DISTS.map((d, i) => ({ label: `${i + 1}:${d.title}` })),
      sel: Math.max(0, this.kind),
      digits: 'index',
      pick: (i) => {
        if (i === 2) {
          this.calc.openMenu({
            title: 'Tail',
            items: [{ label: '1:Left' }, { label: '2:Right' }, { label: '3:Central' }],
            sel: 0,
            digits: 'index',
            pick: (t) => {
              this.tail = (['left', 'right', 'central'] as const)[t];
              this.configure(i);
            },
          });
        } else this.configure(i);
      },
    });
  }

  private configure(i: number): void {
    this.kind = i;
    this.grid.resize(DISTS[i].fields.length, 1);
    this.grid.sel = { r: 0, c: 0 };
    this.out = null;
    this.err = null;
    this.scroll = 0;
  }

  private execute(): void {
    const def = DISTS[this.kind];
    try {
      const vals: DecT[] = def.fields.map((f, r) => {
        if (this.grid.isEmpty(r, 0)) {
          if (f.def === undefined) throw mathError();
          return new D(f.def);
        }
        return N.toDec(this.grid.get(r, 0));
      });
      this.out = def.run(vals, this.tail);
      this.scroll = 0;
      this.err = null;
    } catch (e) {
      if (e instanceof CalcError) this.err = e;
      else throw e;
    }
  }

  handle(cmd: string): boolean {
    if (this.kind < 0) return true;
    if (this.err) {
      if (cmd === 'ac') this.err = null;
      return true;
    }
    if (this.out) {
      switch (cmd) {
        case 'up':
          if (this.scroll > 0) this.scroll--;
          break;
        case 'down':
          if (this.scroll < this.out.length - 2) this.scroll++;
          break;
        case 'eq':
        case 'ac':
          this.out = null;
          break;
        default:
          break;
      }
      return true;
    }
    const g = this.grid;
    if (cmd === 'eq' && g.sel.r === g.rows - 1) {
      g.handle('eq');
      g.sel = { r: g.rows - 1, c: 0 };
      if (!g.error) this.execute();
      return true;
    }
    g.handle(cmd);
    return true;
  }

  screen(): ModeScreen {
    const status = { mode: 'DIST' };
    if (this.kind < 0) return { rows: [{ t: 'line', text: 'DIST' }], status };
    const def = DISTS[this.kind];
    if (this.err) {
      return { rows: [{ t: 'line', text: this.err.message }, { t: 'line', text: '' }, { t: 'line', text: '[AC]  :Cancel', dim: true }, { t: 'line', text: '[◀][▶]:Goto', dim: true }], status };
    }
    if (this.out) {
      const rows: Row[] = this.out.slice(this.scroll, this.scroll + 2).map((o) => ({ t: 'expr', node: row(text(`${o.label}=`), numNode(o.v, this.calc.setup)) }));
      return { rows, status: { ...status, up: this.scroll > 0, down: this.scroll < this.out.length - 2 } };
    }
    const g = this.grid;
    const rows: Row[] = [{ t: 'line', text: def.title + (this.kind === 2 ? ` (${this.tail})` : ''), title: true }];
    const visible = 3;
    const top = Math.min(Math.max(0, g.sel.r - (visible - 1)), Math.max(0, g.rows - visible));
    for (let r = top; r < Math.min(g.rows, top + visible); r++) {
      const isSel = r === g.sel.r;
      const f = def.fields[r];
      const valText = g.ed && isSel ? '' : g.isEmpty(r, 0) ? (f.def ?? '') : g.cellText(r, 0, 14);
      rows.push({
        t: 'cells',
        cells: [
          { text: f.label, w: 30 },
          { text: valText, inv: isSel && !g.ed, cursor: isSel && !!g.ed, node: g.ed && isSel ? renderEditor(g.ed) : undefined, w: 70 },
        ],
      });
    }
    return { rows, cursorRow: g.ed ? 1 + (g.sel.r - top) : undefined, status: { ...status, up: top > 0, down: top + visible < g.rows } };
  }

  serialize(): unknown {
    return { kind: this.kind, tail: this.tail, cells: this.grid.cells.map((r) => r.map((v) => (v ? numToJ(v) : null))) };
  }
  restore(j: unknown): void {
    const o = j as { kind?: number; tail?: Dist.Tail; cells?: (Record<string, unknown> | null)[][] };
    if (o?.kind === undefined || o.kind < 0 || o.kind >= DISTS.length) return;
    this.tail = o.tail ?? 'left';
    this.configure(o.kind);
    o.cells?.forEach((r, ri) => r.forEach((v, ci) => v && this.grid.set(ri, ci, numFromJ(v))));
  }
}

registerMode('DIST', (c) => new DistController(c));
