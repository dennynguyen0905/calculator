// Render tree: a tiny 2D math layout description shared by results and the editor.

export type RNode =
  | { t: 't'; s: string }
  | { t: 'row'; c: RNode[] }
  | { t: 'frac'; n: RNode; d: RNode }
  | { t: 'mixed'; w: RNode; n: RNode; d: RNode }
  | { t: 'sqrt'; a: RNode; idx?: RNode }
  | { t: 'sup'; e: RNode }
  | { t: 'sub'; e: RNode }
  | { t: 'box' }
  | { t: 'cur'; ins?: boolean }
  | { t: 'abs'; a: RNode }
  | { t: 'big'; s: string; lo?: RNode; hi?: RNode; body: RNode; suffix?: string }
  | { t: 'deriv'; body: RNode; at: RNode }
  | { t: 'mat'; rows: RNode[][]; vec?: boolean };

export const text = (s: string): RNode => ({ t: 't', s });
export const row = (...c: RNode[]): RNode => ({ t: 'row', c });
export const frac = (n: RNode, d: RNode): RNode => ({ t: 'frac', n, d });
export const sqrtN = (a: RNode, idx?: RNode): RNode => ({ t: 'sqrt', a, idx });
export const sup = (e: RNode): RNode => ({ t: 'sup', e });
export const EMPTY: RNode = { t: 'row', c: [] };

function atomic(s: string): boolean {
  return /^[-−]?[\dA-Za-zπ.]*$/.test(s) || /^\d+(\.\d+)?$/.test(s);
}
function needsParen(s: string): boolean {
  return /[+\-−×÷/]/.test(s.slice(1)) || /\s/.test(s);
}

/** Linear text rendering, used by tests and by Line display fallbacks. */
export function plain(n: RNode): string {
  switch (n.t) {
    case 't':
      return n.s;
    case 'row':
      return n.c.map(plain).join('');
    case 'frac': {
      const a = plain(n.n);
      const b = plain(n.d);
      return `${needsParen(a) ? `(${a})` : a}/${needsParen(b) ? `(${b})` : b}`;
    }
    case 'mixed':
      return `${plain(n.w)} ${plain(n.n)}/${plain(n.d)}`;
    case 'sqrt': {
      const a = plain(n.a);
      const pre = n.idx ? `${plain(n.idx)}√` : '√';
      return atomic(a) && !a.startsWith('-') ? `${pre}${a}` : `${pre}(${a})`;
    }
    case 'sup': {
      const e = plain(n.e);
      return atomic(e) ? `^${e}` : `^(${e})`;
    }
    case 'sub':
      return `_${plain(n.e)}`;
    case 'box':
      return '□';
    case 'cur':
      return '|';
    case 'abs':
      return `|${plain(n.a)}|`;
    case 'big':
      return `${n.s}(${n.lo ? plain(n.lo) : ''},${n.hi ? plain(n.hi) : ''},${plain(n.body)})`;
    case 'deriv':
      return `d/dx(${plain(n.body)})|x=${plain(n.at)}`;
    case 'mat':
      return `[${n.rows.map((r) => `[${r.map(plain).join(' ')}]`).join('')}]`;
  }
}
