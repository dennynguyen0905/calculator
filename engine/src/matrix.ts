// Matrices and vectors of Num (MATRIX / VECTOR modes).

import { CalcError, mathError } from './errors';
import * as N from './num';
import type { Num } from './num';

export interface MatVal {
  readonly t: 'm';
  readonly rows: number;
  readonly cols: number;
  readonly a: readonly Num[];
  /** vectors are stored as 1×n row matrices with vec = true */
  readonly vec?: boolean;
}

const dimErr = () => new CalcError('Dimension');

export function mk(rows: number, cols: number, a: Num[], vec = false): MatVal {
  return { t: 'm', rows, cols, a, vec: vec || undefined };
}
export const at = (m: MatVal, r: number, c: number): Num => m.a[r * m.cols + c];
export const isMat = (v: unknown): v is MatVal => !!v && (v as { t?: string }).t === 'm';

export function zeros(rows: number, cols: number): MatVal {
  return mk(rows, cols, new Array<Num>(rows * cols).fill(N.ZERO));
}
export function identity(n: number): MatVal {
  const a = new Array<Num>(n * n).fill(N.ZERO);
  for (let i = 0; i < n; i++) a[i * n + i] = N.ONE;
  return mk(n, n, a);
}
export function vector(a: Num[]): MatVal {
  return mk(1, a.length, a, true);
}

export function map(m: MatVal, f: (x: Num) => Num): MatVal {
  return mk(m.rows, m.cols, m.a.map(f), m.vec);
}

export function add(x: MatVal, y: MatVal): MatVal {
  if (x.rows !== y.rows || x.cols !== y.cols || !!x.vec !== !!y.vec) throw dimErr();
  return mk(x.rows, x.cols, x.a.map((v, i) => N.add(v, y.a[i])), x.vec);
}
export function sub(x: MatVal, y: MatVal): MatVal {
  if (x.rows !== y.rows || x.cols !== y.cols || !!x.vec !== !!y.vec) throw dimErr();
  return mk(x.rows, x.cols, x.a.map((v, i) => N.sub(v, y.a[i])), x.vec);
}
export function scale(x: MatVal, k: Num): MatVal {
  return map(x, (v) => N.mul(v, k));
}
export function mul(x: MatVal, y: MatVal): MatVal {
  if (x.vec || y.vec) throw dimErr();
  if (x.cols !== y.rows) throw dimErr();
  const out: Num[] = [];
  for (let i = 0; i < x.rows; i++) {
    for (let j = 0; j < y.cols; j++) {
      let s: Num = N.ZERO;
      for (let k = 0; k < x.cols; k++) s = N.add(s, N.mul(at(x, i, k), at(y, k, j)));
      out.push(s);
    }
  }
  return mk(x.rows, y.cols, out);
}
export function trn(x: MatVal): MatVal {
  if (x.vec) throw dimErr();
  const out: Num[] = [];
  for (let j = 0; j < x.cols; j++) for (let i = 0; i < x.rows; i++) out.push(at(x, i, j));
  return mk(x.cols, x.rows, out);
}

function toRows(m: MatVal): Num[][] {
  const rows: Num[][] = [];
  for (let i = 0; i < m.rows; i++) rows.push(m.a.slice(i * m.cols, (i + 1) * m.cols) as Num[]);
  return rows;
}

export function det(m: MatVal): Num {
  if (m.vec || m.rows !== m.cols) throw dimErr();
  const n = m.rows;
  const a = toRows(m);
  let d: Num = N.ONE;
  for (let c = 0; c < n; c++) {
    let p = -1;
    for (let r = c; r < n; r++) {
      if (!N.isZero(a[r][c])) {
        p = r;
        break;
      }
    }
    if (p < 0) return N.ZERO;
    if (p !== c) {
      [a[p], a[c]] = [a[c], a[p]];
      d = N.neg(d);
    }
    d = N.mul(d, a[c][c]);
    for (let r = c + 1; r < n; r++) {
      const f = N.div(a[r][c], a[c][c]);
      if (N.isZero(f)) continue;
      for (let k = c; k < n; k++) a[r][k] = N.sub(a[r][k], N.mul(f, a[c][k]));
    }
  }
  return d;
}

export function inverse(m: MatVal): MatVal {
  if (m.vec || m.rows !== m.cols) throw dimErr();
  const n = m.rows;
  const a = toRows(m);
  const b = toRows(identity(n));
  for (let c = 0; c < n; c++) {
    let p = -1;
    for (let r = c; r < n; r++) {
      if (!N.isZero(a[r][c])) {
        p = r;
        break;
      }
    }
    if (p < 0) throw mathError();
    [a[p], a[c]] = [a[c], a[p]];
    [b[p], b[c]] = [b[c], b[p]];
    const piv = a[c][c];
    for (let k = 0; k < n; k++) {
      a[c][k] = N.div(a[c][k], piv);
      b[c][k] = N.div(b[c][k], piv);
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (N.isZero(f)) continue;
      for (let k = 0; k < n; k++) {
        a[r][k] = N.sub(a[r][k], N.mul(f, a[c][k]));
        b[r][k] = N.sub(b[r][k], N.mul(f, b[c][k]));
      }
    }
  }
  return mk(n, n, b.flat());
}

export function powInt(m: MatVal, k: number): MatVal {
  if (m.vec || m.rows !== m.cols) throw dimErr();
  if (k < 0) return powInt(inverse(m), -k);
  let result = identity(m.rows);
  let base = m;
  let n = k;
  while (n > 0) {
    if (n & 1) result = mul(result, base);
    n >>= 1;
    if (n > 0) base = mul(base, base);
  }
  return result;
}

// ---------------------------------------------------------------- vectors

function needVec(x: MatVal): void {
  if (!x.vec) throw dimErr();
}
export function dot(x: MatVal, y: MatVal): Num {
  needVec(x);
  needVec(y);
  if (x.cols !== y.cols) throw dimErr();
  let s: Num = N.ZERO;
  for (let i = 0; i < x.cols; i++) s = N.add(s, N.mul(x.a[i], y.a[i]));
  return s;
}
export function cross(x: MatVal, y: MatVal): MatVal {
  needVec(x);
  needVec(y);
  if (x.cols !== y.cols) throw dimErr();
  if (x.cols === 2) {
    // 2-D cross treated as 3-D with z = 0 -> (0, 0, x1 y2 − x2 y1)
    return vector([N.ZERO, N.ZERO, N.sub(N.mul(x.a[0], y.a[1]), N.mul(x.a[1], y.a[0]))]);
  }
  if (x.cols !== 3) throw dimErr();
  const [a1, a2, a3] = x.a;
  const [b1, b2, b3] = y.a;
  return vector([
    N.sub(N.mul(a2, b3), N.mul(a3, b2)),
    N.sub(N.mul(a3, b1), N.mul(a1, b3)),
    N.sub(N.mul(a1, b2), N.mul(a2, b1)),
  ]);
}
export function norm(x: MatVal): Num {
  let s: Num = N.ZERO;
  for (const v of x.a) s = N.add(s, N.mul(v, v));
  return N.sqrt(s);
}
export function unit(x: MatVal): MatVal {
  needVec(x);
  const n = norm(x);
  if (N.isZero(n)) throw mathError();
  return map(x, (v) => N.div(v, n));
}
