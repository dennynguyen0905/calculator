// VERIFY mode: check whether an equation or inequality is TRUE or FALSE.

import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { syntaxError } from '../errors';
import { evalItems, type Val } from '../evaluator';
import { text } from '../format/rnode';
import type { Slot } from '../items';
import * as C from '../complex';
import * as N from '../num';
import { ExprPad, type PadResult } from '../pad';

const RELS = ['=', '≠', '>', '<', '≥', '≤'];

function compare(l: Val, r: Val, op: string): boolean {
  const scalar = (v: Val): C.Scalar => {
    if (v.t === 'x' || v.t === 'a' || v.t === 'c') return v;
    throw syntaxError();
  };
  const a = scalar(l);
  const b = scalar(r);
  if (op === '=' || op === '≠') {
    const eq = N.eq(C.reOf(a), C.reOf(b)) && N.eq(C.imOf(a), C.imOf(b));
    return op === '=' ? eq : !eq;
  }
  if (C.isCx(a) || C.isCx(b)) throw syntaxError();
  const c = N.cmp(a, b);
  switch (op) {
    case '>':
      return c > 0;
    case '<':
      return c < 0;
    case '≥':
      return c >= 0;
    default:
      return c <= 0;
  }
}

export class VerifyController implements ModeController {
  readonly pad: ExprPad;
  constructor(private readonly calc: Calculator) {
    this.pad = new ExprPad(calc, {
      allowCalc: false,
      evalFn: (items: Slot): Val => {
        const idx = items.findIndex((it) => it.k === 'c' && RELS.includes(it.s));
        if (idx < 0 || items.slice(idx + 1).some((it) => it.k === 'c' && RELS.includes(it.s))) throw syntaxError();
        const left = items.slice(0, idx);
        const right = items.slice(idx + 1);
        if (left.length === 0 || right.length === 0) throw syntaxError();
        calc.applySetupToCtx();
        const op = (items[idx] as { s: string }).s;
        return compare(evalItems(left, calc.ctx), evalItems(right, calc.ctx), op) ? N.ONE : N.ZERO;
      },
      format: (r: PadResult) => ({ lines: [text(r.val.t === 'x' && N.isZero(r.val) ? 'FALSE' : 'TRUE')], canToggle: false, exactShown: true }),
    });
  }

  handle(cmd: string): boolean {
    if (cmd === 'optn') {
      this.calc.openMenu({
        title: 'VERIFY',
        items: RELS.map((r, i) => ({ label: `${i + 1}:${r}` })),
        sel: 0,
        digits: 'index',
        pick: (i) => this.pad.handle(`tok:${RELS[i]}`),
      });
      return true;
    }
    return this.pad.handle(cmd);
  }

  currentValue(): Val | null {
    return this.pad.evalCurrent();
  }

  screen(): ModeScreen {
    const r = this.pad.rows();
    return { rows: r.rows, cursorRow: r.cursorRow, status: { mode: 'VERIFY', up: this.pad.hist.length > 0, down: this.pad.histPos >= 0 } };
  }

  serialize(): unknown {
    return this.pad.serialize();
  }
  restore(j: unknown): void {
    this.pad.restore(j);
  }
}

registerMode('VERIFY', (c) => new VerifyController(c));
