// Editor items -> render tree (with optional cursor).

import { CONSTANTS, constFromId } from '../constants';
import type { PathStep, Editor } from './editor';
import type { RNode } from '../format/rnode';
import type { Item, Slot } from '../items';

interface CurInfo {
  rest: PathStep[];
  idx: number;
}

const CUR = (ins: boolean): RNode => ({ t: 'cur', ins });
const BOX: RNode = { t: 'box' };

export function displayToken(s: string): string {
  const cn = constFromId(s);
  if (cn !== null) return CONSTANTS[cn - 1].sym;
  switch (s) {
    case '@rA':
      return 'A';
    case '@rB':
      return 'B';
    case '@rC':
      return 'C';
    case '-':
      return '-';
    case 'Rem(':
    case 'Quotient(':
      return s;
    default:
      return s;
  }
}

function merge(nodes: RNode[]): RNode {
  const out: RNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.t === 't' && last && last.t === 't') out[out.length - 1] = { t: 't', s: last.s + n.s };
    else out.push(n);
  }
  return out.length === 1 ? out[0] : { t: 'row', c: out };
}

function slotCur(info: CurInfo | null, name: string): CurInfo | null {
  return info && info.rest.length >= 0 && (info as CurInfo & { slot?: string }).slot === name ? { rest: info.rest, idx: info.idx } : null;
}

function renderSlot(slot: Slot, cur: CurInfo | null, ins: boolean, template: boolean): RNode {
  const out: RNode[] = [];
  const here = cur && cur.rest.length === 0 ? cur.idx : -1;
  slot.forEach((it, i) => {
    if (i === here) out.push(CUR(ins));
    let sub: (CurInfo & { slot: string }) | null = null;
    if (cur && cur.rest.length > 0 && cur.rest[0].idx === i) {
      sub = { slot: cur.rest[0].slot, rest: cur.rest.slice(1), idx: cur.idx };
    }
    out.push(renderItem(it, sub, ins));
  });
  if (here === slot.length) out.push(CUR(ins));
  if (slot.length === 0 && here < 0 && template) return BOX;
  if (slot.length === 0 && here >= 0 && template) return { t: 'row', c: [CUR(ins)] };
  return merge(out);
}

function renderItem(it: Item, info: (CurInfo & { slot: string }) | null, ins: boolean): RNode {
  const S = (slot: Slot, name: string): RNode => renderSlot(slot, slotCur(info, name), ins, true);
  switch (it.k) {
    case 'c':
      return { t: 't', s: displayToken(it.s) };
    case 'frac':
      return { t: 'frac', n: S(it.n, 'n'), d: S(it.d, 'd') };
    case 'mix':
      return { t: 'mixed', w: S(it.w, 'w'), n: S(it.n, 'n'), d: S(it.d, 'd') };
    case 'sqrt':
      return { t: 'sqrt', a: S(it.a, 'a') };
    case 'cbrt':
      return { t: 'sqrt', a: S(it.a, 'a'), idx: { t: 't', s: '3' } };
    case 'root':
      return { t: 'sqrt', a: S(it.a, 'a'), idx: S(it.n, 'n') };
    case 'pow':
      return { t: 'sup', e: S(it.e, 'e') };
    case 'e10':
      return { t: 'row', c: [{ t: 't', s: '×10' }, { t: 'sup', e: S(it.e, 'e') }] };
    case 'logb':
      return { t: 'row', c: [{ t: 't', s: 'log' }, { t: 'sub', e: S(it.b, 'b') }] };
    case 'abs':
      return { t: 'abs', a: S(it.a, 'a') };
    case 'sigma':
      return {
        t: 'big',
        s: 'Σ',
        lo: { t: 'row', c: [{ t: 't', s: 'X=' }, S(it.lo, 'lo')] },
        hi: S(it.hi, 'hi'),
        body: S(it.body, 'body'),
      };
    case 'integ':
      return { t: 'big', s: '∫', lo: S(it.lo, 'lo'), hi: S(it.hi, 'hi'), body: S(it.body, 'body'), suffix: 'dx' };
    case 'deriv':
      return { t: 'deriv', body: S(it.body, 'body'), at: S(it.at, 'at') };
  }
}

/** render the root expression of an editor, with cursor */
export function renderEditor(e: Editor, showCursor = true): RNode {
  const cur = showCursor ? { rest: e.cur.path, idx: e.cur.idx } : null;
  return renderSlot(e.root, cur, e.insert, false);
}

/** render a stored expression without cursor */
export function renderItems(items: Slot): RNode {
  return renderSlot(items, null, true, false);
}
