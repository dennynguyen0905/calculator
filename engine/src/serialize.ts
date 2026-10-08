// JSON (de)serialisation of values, used to persist Ans, variables and history in local storage.

import type * as C from './complex';
import { D } from './dec';
import type { Val } from './evaluator';
import type { Ex } from './exact';
import type * as M from './matrix';
import type { Num } from './num';
import { Q } from './rational';

type J = Record<string, unknown>;

function exToJ(v: Ex): unknown {
  return v.map((t) => [t.p, t.r.toString(), t.c.n.toString(), t.c.d.toString()]);
}
function exFromJ(j: unknown): Ex {
  return (j as [number, string, string, string][]).map(([p, r, n, d]) => ({ p, r: BigInt(r), c: Q.of(BigInt(n), BigInt(d)) }));
}

export function numToJ(n: Num): J {
  return n.t === 'x' ? { t: 'x', v: exToJ(n.v), d: n.d } : { t: 'a', v: n.v.toString() };
}
export function numFromJ(j: J): Num {
  return j.t === 'x' ? { t: 'x', v: exFromJ(j.v), d: !!j.d } : { t: 'a', v: new D(j.v as string) };
}

export function valToJ(v: Val): J {
  switch (v.t) {
    case 'x':
    case 'a':
      return numToJ(v);
    case 'c':
      return { t: 'c', re: numToJ(v.re), im: numToJ(v.im) };
    case 'm':
      return { t: 'm', rows: v.rows, cols: v.cols, vec: !!v.vec, a: v.a.map(numToJ) };
    case 'qr':
      return { t: 'qr', q: numToJ(v.q), r: numToJ(v.r) };
    case 'pf':
      return { t: 'pf', n: v.n.toString() };
    case 'multi':
      return { t: 'multi', items: v.items.map((i) => ({ label: i.label, v: valToJ(i.v) })) };
  }
}

export function valFromJ(j: J): Val {
  switch (j.t) {
    case 'x':
    case 'a':
      return numFromJ(j);
    case 'c':
      return { t: 'c', re: numFromJ(j.re as J), im: numFromJ(j.im as J) } as C.CxVal;
    case 'm':
      return { t: 'm', rows: j.rows as number, cols: j.cols as number, vec: (j.vec as boolean) || undefined, a: (j.a as J[]).map(numFromJ) } as M.MatVal;
    case 'qr':
      return { t: 'qr', q: numFromJ(j.q as J), r: numFromJ(j.r as J) };
    case 'pf':
      return { t: 'pf', n: BigInt(j.n as string) };
    case 'multi':
      return { t: 'multi', items: (j.items as { label: string; v: J }[]).map((i) => ({ label: i.label, v: valFromJ(i.v) })) };
    default:
      throw new Error('bad value json');
  }
}
