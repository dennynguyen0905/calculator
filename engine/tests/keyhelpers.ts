import { Calculator } from '../src/calculator';
import { plain, type RNode } from '../src/format/rnode';
import type { Row } from '../src/screen';
import '../src/modes';

export function newCalc(): Calculator {
  return new Calculator();
}

/** press space-separated key ids */
export function press(c: Calculator, seq: string): Calculator {
  for (const k of seq.trim().split(/\s+/)) if (k) c.press(k);
  return c;
}

function rowText(r: Row): string {
  switch (r.t) {
    case 'expr':
      return plain(r.node);
    case 'result':
      return r.nodes.map((n: RNode) => plain(n)).join(' | ');
    case 'line':
      return r.text;
    case 'node':
      return plain(r.node);
    case 'cells':
      return r.cells.map((c) => c.text).join(' ');
  }
}

export function lines(c: Calculator): string[] {
  return c.screen.rows.map(rowText);
}

/** run keys on a fresh calculator and return the screen lines */
export function run(seq: string, c = newCalc()): string[] {
  press(c, seq);
  return lines(c);
}

/** the result line (second row) after running keys */
export function res(seq: string, c = newCalc()): string {
  return run(seq, c)[1] ?? '';
}
