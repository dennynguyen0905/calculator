// Turn evaluation results (Val) into render trees according to the calculator setup.

import * as C from '../complex';
import { D, type Dec } from '../dec';
import type { Val } from '../evaluator';
import { factorize } from '../bigmath';
import * as F from '../mathfn';
import * as M from '../matrix';
import * as N from '../num';
import type { Num } from '../num';
import type { Setup } from '../settings';
import { decimalNode, decimalString, type FmtOpts } from './decimal';
import { exactNode, fractionNode } from './exact';
import { plain, row, sup, text, type RNode } from './rnode';

export interface ViewOpts {
  /** S⇔D toggled for this result */
  toggled?: boolean;
  /** ENG key presses (see FmtOpts.engStep) */
  engStep?: number;
  /** show result as degrees-minutes-seconds */
  dms?: boolean;
  /** override the complex output format for this result (▶r∠θ / ▶a+bi) */
  complexFmt?: 'rect' | 'polar';
}

export interface ValueView {
  lines: RNode[];
  canToggle: boolean;
  /** true if the primary (untoggled) form of the result is exact */
  exactShown: boolean;
}

export function fmtOpts(setup: Setup, engStep = 0): FmtOpts {
  return {
    fmt: setup.numFmt,
    engStep,
    engSymbol: setup.engSymbol,
    mark: setup.decimalMark,
    sep: setup.digitSep,
  };
}

interface NumView {
  node: RNode;
  canToggle: boolean;
  exactShown: boolean;
}

/** exact form of a Num (null when none is displayable) */
function exactForm(n: Num, setup: Setup): RNode | null {
  if (n.t !== 'x') return null;
  const q = N.rationalOf(n);
  if (setup.io === 'line') {
    if (!q || q.isInt) return null;
    const neg = q.n < 0n;
    const nn = neg ? -q.n : q.n;
    if (setup.frac === 'abc' && nn > q.d) {
      return text(`${neg ? '-' : ''}${nn / q.d}⌟${nn % q.d}⌟${q.d}`);
    }
    return text(`${neg ? '-' : ''}${nn}⌟${q.d}`);
  }
  if (q && q.isInt) return null;
  return exactNode(n.v, { frac: setup.frac });
}

function numView(n: Num, setup: Setup, toggled: boolean, eng: number): NumView {
  const dec = (): RNode => decimalNode(N.toDec(n), fmtOpts(setup, eng));
  const ex = exactForm(n, setup);
  if (!ex) return { node: dec(), canToggle: false, exactShown: false };
  const baseExact = n.t === 'x' && !n.d;
  const showExact = baseExact !== toggled;
  return { node: showExact ? ex : dec(), canToggle: true, exactShown: baseExact };
}

export function numNode(n: Num, setup: Setup, toggled = false, eng = 0): RNode {
  return numView(n, setup, toggled, eng).node;
}

// ---------------------------------------------------------------- DMS

export function dmsNode(n: Num): RNode {
  const x = N.toDec(n);
  const neg = x.isNeg();
  let ax = x.abs();
  let deg = ax.floor();
  const rem = ax.sub(deg).mul(60);
  let min = rem.floor();
  let sec = rem.sub(min).mul(60).toDecimalPlaces(2, D.ROUND_HALF_UP);
  if (sec.gte(60)) {
    sec = sec.sub(60);
    min = min.add(1);
  }
  if (min.gte(60)) {
    min = min.sub(60);
    deg = deg.add(1);
  }
  ax = deg;
  const secText = sec.toFixed().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return text(`${neg ? '-' : ''}${deg.toFixed()}°${min.toFixed()}′${secText}″`);
}

// ---------------------------------------------------------------- complex

function imagCoef(im: Num, setup: Setup, toggled: boolean, eng: number): { node: RNode | null; canToggle: boolean; exactShown: boolean } {
  const a = N.abs(im);
  if (N.eq(a, N.ONE) && a.t === 'x') return { node: null, canToggle: false, exactShown: true };
  const v = numView(a, setup, toggled, eng);
  return { node: v.node, canToggle: v.canToggle, exactShown: v.exactShown };
}

function complexView(z: C.CxVal, setup: Setup, toggled: boolean, eng: number): NumView {
  if (setup.complexFmt === 'polar') {
    const r = C.cAbs(z);
    const th = C.cArg(z, setup.angle);
    const rv = numView(r, setup, toggled, eng);
    const tv = numView(th, setup, toggled, eng);
    return {
      node: row(rv.node, text('∠'), tv.node),
      canToggle: rv.canToggle || tv.canToggle,
      exactShown: rv.exactShown || tv.exactShown,
    };
  }
  const parts: RNode[] = [];
  let canToggle = false;
  let exactShown = false;
  const hasRe = !N.isZero(z.re);
  if (hasRe) {
    const v = numView(z.re, setup, toggled, eng);
    parts.push(v.node);
    canToggle = v.canToggle;
    exactShown = v.exactShown;
  }
  const neg = N.sign(z.im) < 0;
  if (hasRe) parts.push(text(neg ? '-' : '+'));
  else if (neg) parts.push(text('-'));
  const ic = imagCoef(z.im, setup, toggled, eng);
  canToggle = canToggle || ic.canToggle;
  exactShown = exactShown || ic.exactShown;
  if (ic.node) parts.push(ic.node);
  parts.push(text('i'));
  return { node: row(...parts), canToggle, exactShown };
}

// ---------------------------------------------------------------- prime factors

function pfNode(n: bigint): RNode {
  const fs = factorize(n);
  const parts: RNode[] = [];
  fs.forEach(([p, e], i) => {
    if (i > 0) parts.push(text('×'));
    parts.push(text(p.toString()));
    if (e > 1) parts.push(sup(text(String(e))));
  });
  return row(...parts);
}

// ---------------------------------------------------------------- entry

export function formatValue(v: Val, setup0: Setup, o: ViewOpts = {}): ValueView {
  const setup = o.complexFmt ? { ...setup0, complexFmt: o.complexFmt } : setup0;
  const toggled = !!o.toggled;
  const eng = o.engStep ?? 0;
  switch (v.t) {
    case 'x':
    case 'a': {
      if (o.dms) return { lines: [dmsNode(v)], canToggle: false, exactShown: false };
      const nv = numView(v, setup, toggled, eng);
      return { lines: [nv.node], canToggle: nv.canToggle, exactShown: nv.exactShown };
    }
    case 'c': {
      const nv = complexView(v, setup, toggled, eng);
      return { lines: [nv.node], canToggle: nv.canToggle, exactShown: nv.exactShown };
    }
    case 'm': {
      const rows: RNode[][] = [];
      for (let i = 0; i < v.rows; i++) {
        const r: RNode[] = [];
        for (let j = 0; j < v.cols; j++) r.push(numView(M.at(v, i, j), setup, toggled, eng).node);
        rows.push(r);
      }
      return { lines: [{ t: 'mat', rows, vec: v.vec }], canToggle: false, exactShown: false };
    }
    case 'qr': {
      const q = numView(v.q, setup, false, eng).node;
      const r = numView(v.r, setup, false, eng).node;
      return { lines: [row(q, text(' R '), r)], canToggle: false, exactShown: false };
    }
    case 'pf':
      return { lines: [pfNode(v.n)], canToggle: false, exactShown: false };
    case 'multi': {
      const lines = v.items.map((it) => {
        const inner = formatValue(it.v, setup, o).lines[0];
        return row(text(`${it.label}=`), inner);
      });
      return { lines, canToggle: false, exactShown: false };
    }
  }
}

/** Plain-text result as it would appear on screen; mainly for tests. */
export function formatPlain(v: Val, setup: Setup, o: ViewOpts = {}): string {
  return formatValue(v, setup, o).lines.map(plain).join(' | ');
}

/** Rnd(: round to the displayed number of digits */
export function roundForDisplay(n: Num, setup: Setup): Num {
  const { kind, n: k } = setup.numFmt;
  const d: Dec = N.toDec(n);
  if (kind === 'fix') return N.na(d.toDecimalPlaces(k, D.ROUND_HALF_UP));
  if (kind === 'sci') return N.na(d.toSignificantDigits(k === 0 ? 10 : k, D.ROUND_HALF_UP));
  if (n.t === 'x' && N.isInteger(n)) return n;
  return N.na(d.toSignificantDigits(10, D.ROUND_HALF_UP));
}

export { decimalString, fractionNode, F };
