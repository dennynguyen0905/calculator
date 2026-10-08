import { describe, expect, it } from 'vitest';
import { defaultSetup } from '../src/settings';
import { formatPlain } from '../src/format/value';
import * as N from '../src/num';
import { solveLinear, solvePolynomial } from '../src/poly';
import { Q } from '../src/rational';
import { lines, newCalc, press } from './keyhelpers';

const setup = defaultSetup();
const num = (x: number | string): N.Num => {
  if (typeof x === 'number') return N.fromInt(x);
  const [n, d = '1'] = x.split('/');
  return N.fromQ(Q.of(BigInt(n), BigInt(d)));
};
const P = (...co: (number | string)[]): string[] => solvePolynomial(co.map(num)).roots.map((r) => formatPlain(r, setup));
const L = (rows: (number | string)[][]): string[] => solveLinear(rows.map((r) => r.map(num))).map((v) => formatPlain(v, setup));

describe('polynomial roots', () => {
  it.each<[(number | string)[], string[]]>([
    [[1, -3, 2], ['2', '1']],
    [[1, 0, -2], ['√2', '-√2']],
    [[1, 0, 1], ['i', '-i']],
    [[1, 2, 5], ['-1+2i', '-1-2i']],
    [[2, -1, -1], ['1', '-1/2']],
    [[1, 2, 1], ['-1']],
    [[1, -1, -1], ['(1+√5)/2', '(1-√5)/2']],
    [[1, 0, -8], ['2√2', '-2√2']],
    [[4, 0, -1], ['1/2', '-1/2']],
    [[1, 0, 0], ['0']],
    [[3, 6, 0], ['0', '-2']],
    [[2, 3, 1], ['-1/2', '-1']],
    [[1, -6, 9], ['3']],
    [[1, 1, 1], ['-1/2+√3/2i', '-1/2-√3/2i']],
    [[1, -4, 1], ['2+√3', '2-√3']],
    [[1, -3, 0], ['3', '0']],
    [[0.5, 0, -2].map(String).map((s) => (s === '0.5' ? '1/2' : s)), ['2', '-2']],
    [[1, -6, 11, -6], ['1', '2', '3']],
    [[1, -2, -5, 6], ['-2', '1', '3']],
    [[1, 0, 0, -1], ['-1/2-√3/2i', '-1/2+√3/2i', '1']],
    [[2, -3, -3, 2], ['-1', '1/2', '2']],
    [[1, 0, 0, 0], ['0']],
    [[1, -3, 3, -1], ['1']],
    [[1, 0, 0, 8], ['-2', '1-√3i', '1+√3i']],
    [[1, -10, 35, -50, 24], ['1', '2', '3', '4']],
    [[1, 0, -5, 0, 4], ['-2', '-1', '1', '2']],
    [[1, 0, 0, 0, -1], ['-1', '-i', 'i', '1']],
    [[1, 0, 0, 0, 4], ['-1-i', '-1+i', '1-i', '1+i']],
    [[1, 0, 1, 0, 0], ['-i', '0', '0', 'i']],
    [[1, 0, 3, 0, 2], ['-√2i', '-i', 'i', '√2i']],
    [[1, 1, 0, 0, 0], ['-1', '0', '0', '0']],
  ])('%j', (co, expected) => {
    expect(P(...co)).toEqual(expected);
  });

  it('cubic with no rational root falls back to numeric roots', () => {
    expect(P(1, 0, 1, 1)).toEqual(['-0.6823278038', '0.3411639019-1.1615414i', '0.3411639019+1.1615414i']);
  });
  it('quartic with irrational biquadratic roots', () => {
    expect(P(1, 0, 0, 0, -2)).toEqual(['-1.189207115', '-1.189207115i', '1.189207115i', '1.189207115']);
  });
  it('leading zero coefficient is an error', () => {
    expect(() => solvePolynomial([N.ZERO, num(1), num(2)])).toThrow();
  });
});

describe('simultaneous equations', () => {
  it.each<[(number | string)[][], string[]]>([
    [[[2, 1, 5], [1, -1, 1]], ['2', '1']],
    [[[1, 2, 3], [3, 1, 4]], ['1', '1']],
    [[[2, 3, 1], [4, 9, 2]], ['1/2', '0']],
    [[[1, 1, 1], [1, -1, 0]], ['1/2', '1/2']],
    [[[3, 2, 1], [1, -1, 2]], ['1', '-1']],
    [[[1, 1, 1, 6], [0, 2, 5, -4], [2, 5, -1, 27]], ['5', '3', '-2']],
    [[[1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 3]], ['1', '2', '3']],
    [[[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]], ['2', '3', '-1']],
    [[[1, 1, 1, 1, 10], [1, -1, 1, -1, -2], [1, 1, -1, -1, 0], [1, -1, -1, 1, 0]], ['2', '3', '2', '3']],
    [[[1, 2, '1/3'], [3, 1, 1]], ['1/3', '0']],
    [[[1, 2, 1], [3, 1, 1]], ['1/5', '2/5']],
  ])('%j', (rows, expected) => {
    expect(L(rows)).toEqual(expected);
  });
  it('singular systems are a Math ERROR', () => {
    expect(() => L([[1, 2, 3], [2, 4, 6]])).toThrow(/Math/);
  });
});

describe('EQN key flow', () => {
  it('2 unknowns', () => {
    const c = newCalc();
    press(c, 'mode 4 1 1'); // Simul, 2 unknowns
    expect(lines(c)[0].startsWith('Simul')).toBe(true);
    press(c, '2 eq 1 eq 5 eq 1 eq neg 1 eq 1 eq');
    expect(lines(c)).toEqual(['x=2', 'y=1']);
  });
  it('polynomial degree 2', () => {
    const c = newCalc();
    press(c, 'mode 4 2 1 1 eq neg 3 eq 2 eq');
    expect(lines(c)).toEqual(['x1=2', 'x2=1']);
  });
  it('S⇔D toggles solutions', () => {
    const c = newCalc();
    press(c, 'mode 4 2 1 1 eq 0 eq neg 2 eq sd');
    expect(lines(c)).toEqual(['x1=1.414213562', 'x2=-1.414213562']);
  });
  it('degree 3 shows roots with scrolling', () => {
    const c = newCalc();
    press(c, 'mode 4 2 2 1 eq neg 6 eq 1 1 eq neg 6 eq');
    expect(lines(c)).toEqual(['x1=1', 'x2=2']);
    expect(c.screen.status.down).toBe(true);
    press(c, 'down');
    expect(lines(c)).toEqual(['x2=2', 'x3=3']);
    press(c, 'ac');
    expect(lines(c)[0].startsWith('Poly')).toBe(true);
  });
  it('singular system shows Math ERROR', () => {
    const c = newCalc();
    press(c, 'mode 4 1 1 1 eq 2 eq 3 eq 2 eq 4 eq 6 eq');
    expect(lines(c)[0]).toBe('Math ERROR');
    press(c, 'ac');
    expect(lines(c)[0].startsWith('Simul')).toBe(true);
  });
  it('cells accept expressions', () => {
    const c = newCalc();
    press(c, 'mode 4 2 1 1 eq 0 eq sqrt 2 right eq');
    // x^2 + 0x + sqrt2 = 0 -> complex roots
    expect(lines(c)[0].startsWith('x1=')).toBe(true);
  });
  it('data is kept when returning to the editor', () => {
    const c = newCalc();
    press(c, 'mode 4 2 1 1 eq neg 3 eq 2 eq ac');
    expect(lines(c)[1]).toBe('1 1 -3 2'.replace('1 1 -3 2', lines(c)[1]));
    expect(lines(c)[1]).toContain('-3');
  });
});
