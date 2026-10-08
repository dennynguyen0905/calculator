// Natural ("Math") display of exact values: fractions, radicals, multiples of π.

import { babs, gcd, lcm } from '../bigmath';
import type { Ex, Term } from '../exact';
import { Q } from '../rational';
import { frac, row, sqrtN, sup, text, type RNode } from './rnode';

const MAX_DIGITS = 10;
const MAX_TERMS = 4;

const digits = (n: bigint): number => babs(n).toString().length;

export interface ExactOpts {
  frac: 'dc' | 'abc';
}

/** a/b as a fraction node, honouring the improper/mixed setting. n,d > 0. */
export function fractionNode(n: bigint, d: bigint, neg: boolean, o: ExactOpts): RNode {
  const sign = neg ? '-' : '';
  if (o.frac === 'abc' && n > d) {
    const w = n / d;
    const r = n % d;
    return row(text(sign), { t: 'mixed', w: text(w.toString()), n: text(r.toString()), d: text(d.toString()) });
  }
  const f = frac(text(n.toString()), text(d.toString()));
  return neg ? row(text('-'), f) : f;
}

function piPart(p: number): RNode {
  return p === 1 ? text('π') : row(text('π'), sup(text(String(p))));
}

/** term with integer coefficient k (|k| shown unless 1 with symbolic part) */
function termBody(k: bigint, t: Term, forceCoef = false): RNode {
  const ak = babs(k);
  const parts: RNode[] = [];
  const symbolic = t.r > 1n || t.p > 0;
  if (ak !== 1n || !symbolic || forceCoef) parts.push(text(ak.toString()));
  if (t.r > 1n) parts.push(sqrtN(text(t.r.toString())));
  if (t.p > 0) parts.push(piPart(t.p));
  return parts.length === 1 ? parts[0] : row(...parts);
}

export function exactNode(ex: Ex, o: ExactOpts): RNode | null {
  if (ex.length === 0) return text('0');
  // pure rational
  if (ex.length === 1 && ex[0].p === 0 && ex[0].r === 1n) {
    const q = ex[0].c;
    if (q.isInt) return digits(q.n) <= MAX_DIGITS ? text(q.n.toString()) : null;
    if (digits(q.n) > MAX_DIGITS || digits(q.d) > MAX_DIGITS) return null;
    return fractionNode(babs(q.n), q.d, q.n < 0n, o);
  }
  if (ex.length > MAX_TERMS) return null;

  // single term with negative power of π:  (n/d) √r / π^m
  if (ex.some((t) => t.p < 0)) {
    if (ex.length !== 1) return null;
    const t = ex[0];
    const n = t.c.n;
    const d = t.c.d;
    if (digits(n) > MAX_DIGITS || digits(d) > MAX_DIGITS) return null;
    const numer = termBody(n, { p: 0, r: t.r, c: Q.ONE });
    const denom: RNode = d === 1n ? piPart(-t.p) : row(text(d.toString()), piPart(-t.p));
    const f = frac(numer, denom);
    return n < 0n ? row(text('-'), f) : f;
  }

  // common denominator
  let L = 1n;
  for (const t of ex) L = lcm(L, t.c.d);
  const ks = ex.map((t) => t.c.n * (L / t.c.d));
  if (digits(L) > MAX_DIGITS || ks.some((k) => digits(k) > MAX_DIGITS)) return null;
  void gcd;
  const allNeg = ks.every((k) => k < 0n);
  const sign = allNeg && L > 1n;
  // positive terms first (so we print 2-√3, √3-√2 rather than -√3+2), canonical order inside each group
  const order = ex.map((_, i) => i);
  order.sort((a, b) => Number(ks[b] > 0n) - Number(ks[a] > 0n) || a - b);
  const parts: RNode[] = [];
  order.forEach((idx, i) => {
    const t = ex[idx];
    const k = sign ? -ks[idx] : ks[idx];
    if (i === 0) {
      if (k < 0n) parts.push(text('-'));
    } else parts.push(text(k < 0n ? '-' : '+'));
    parts.push(termBody(k, t));
  });
  const numer = parts.length === 1 ? parts[0] : row(...parts);
  if (L === 1n) return numer;
  const f = frac(numer, text(L.toString()));
  return sign ? row(text('-'), f) : f;
}
