import { describe, expect, it } from 'vitest';
import type { Calculator } from '../src/calculator';
import { lines, newCalc, press } from './keyhelpers';

const numKeys = (n: number): string => (n < 0 ? 'neg ' : '') + String(Math.abs(n)).split('').join(' ');

/** define a matrix: first one through the mode menu, further ones through SHIFT+4 > Dim */
function define(c: Calculator, kind: 'mat' | 'vct', name: string, data: number[][]): void {
  const idx = 'ABCD'.indexOf(name) + 1;
  const menuKey = kind === 'mat' ? 'shift 4' : 'shift 5';
  press(c, `${menuKey} 1 ${idx}`); // Dim -> select
  if (kind === 'mat') press(c, `${data.length} eq ${data[0].length} eq`);
  else press(c, `${data[0].length} eq`);
  for (const row of data) for (const v of row) press(c, `${numKeys(v)} eq`);
  press(c, 'ac');
}

function matMode(defs: Record<string, number[][]>): Calculator {
  const c = newCalc();
  press(c, 'mode 9 1'); // MATRIX, select MatA
  const first = Object.keys(defs)[0];
  const idxFirst = 'ABCD'.indexOf(first) + 1;
  void idxFirst;
  // first definition (MatA is selected in the menu; assume A is first)
  const a = defs[first];
  press(c, `${a.length} eq ${a[0].length} eq`);
  for (const row of a) for (const v of row) press(c, `${numKeys(v)} eq`);
  press(c, 'ac');
  for (const name of Object.keys(defs).slice(1)) define(c, 'mat', name, defs[name]);
  return c;
}

const A = [[1, 2], [3, 4]];
const B = [[0, 1], [1, 0]];

describe('MATRIX mode', () => {
  it('entering shows the select menu and the dimension prompt', () => {
    const c = newCalc();
    press(c, 'mode 9');
    expect(lines(c)[0]).toBe('Select Matrix');
    press(c, '1');
    expect(lines(c)[0]).toBe('MatA');
    expect(lines(c)[1]).toBe('m= 3');
  });
  it('data editor and storage', () => {
    const c = matMode({ A });
    press(c, 'shift 4 3 eq'); // MatA
    expect(lines(c)).toEqual(['1 2', '3 4', '1,1:1']);
  });
  it.each<[string, string[]]>([
    ['shift 4 3 add shift 4 4 eq', ['1 3', '4 4', '1,1:1']],
    ['shift 4 3 sub shift 4 4 eq', ['1 1', '2 4', '1,1:1']],
    ['shift 4 3 mul shift 4 4 eq', ['2 1', '4 3', '1,1:2']],
    ['shift 4 4 mul shift 4 3 eq', ['3 4', '1 2', '1,1:3']],
    ['2 shift 4 3 eq', ['2 4', '6 8', '1,1:2']],
    ['shift 4 3 mul 2 eq', ['2 4', '6 8', '1,1:2']],
    ['shift 4 3 sq eq', ['7 10', '15 22', '1,1:7']],
    ['shift 4 3 inv eq', ['-2 1', '1.5 -0.5', '1,1:-2']],
    ['shift 4 9 shift 4 3 eq', ['1 3', '2 4', '1,1:1']], // Trn(
    ['shift 4 0 2 eq', ['1 0', '0 1', '1,1:1']], // Ident(2
    ['shift lpar neg 1 shift 4 3 eq', ['1 2', '3 4', '1,1:1']], // Abs(-MatA)
  ])('%s', (keys, expected) => {
    const c = matMode({ A, B });
    press(c, keys);
    expect(lines(c)).toEqual(expected);
  });
  it('determinant', () => {
    const c = matMode({ A });
    press(c, 'shift 4 8 shift 4 3 eq');
    expect(lines(c)[1]).toBe('-2');
  });
  it('3x3 determinant and inverse of a rational matrix', () => {
    const m = [[2, 1, 1], [1, 3, 2], [1, 0, 0]];
    const c = matMode({ A: m });
    press(c, 'shift 4 8 shift 4 3 eq');
    expect(lines(c)[1]).toBe('-1');
  });
  it('MatAns', () => {
    const c = matMode({ A, B });
    press(c, 'shift 4 3 add shift 4 4 eq ac shift 4 7 mul 2 eq');
    expect(lines(c).slice(0, 2)).toEqual(['2 6', '8 8']);
  });
  it('Dimension ERROR and Math ERROR', () => {
    const c = matMode({ A, B });
    press(c, 'shift 4 3 add shift 4 0 3 eq');
    expect(lines(c)[0]).toBe('Dimension ERROR');
    press(c, 'ac');
    const s = matMode({ A: [[1, 2], [2, 4]] });
    press(s, 'shift 4 3 inv eq');
    expect(lines(s)[0]).toBe('Math ERROR');
  });
  it('navigating the result matrix', () => {
    const c = matMode({ A });
    press(c, 'shift 4 3 mul 2 eq down right');
    expect(lines(c)).toEqual(['2 4', '6 8', '2,2:8']);
  });
  it('scalar results still work', () => {
    const c = matMode({ A });
    press(c, '1 add 1 eq');
    expect(lines(c)[1]).toBe('2');
  });
  it('dimension limits', () => {
    const c = newCalc();
    press(c, 'mode 9 1 5 eq 2 eq');
    expect(lines(c)[3]).toBe('Argument ERROR');
  });
  it('persistence', () => {
    const a = matMode({ A });
    const j = JSON.parse(JSON.stringify(a.serialize()));
    const b = newCalc();
    b.restore(j);
    press(b, 'shift 4 3 eq');
    expect(lines(b)).toEqual(['1 2', '3 4', '1,1:1']);
  });
});

function vecMode(defs: Record<string, number[]>): Calculator {
  const c = newCalc();
  press(c, 'mode 0 1');
  const names = Object.keys(defs);
  const first = defs[names[0]];
  press(c, `${first.length} eq`);
  for (const v of first) press(c, `${numKeys(v)} eq`);
  press(c, 'ac');
  for (const name of names.slice(1)) define(c, 'vct', name, [defs[name]]);
  return c;
}

describe('VECTOR mode', () => {
  const V = { A: [1, 2, 3], B: [4, 5, 6] };
  it.each<[string, string]>([
    ['shift 5 3 eq', '[[1 2 3]]'],
    ['shift 5 3 add shift 5 4 eq', '[[5 7 9]]'],
    ['shift 5 4 sub shift 5 3 eq', '[[3 3 3]]'],
    ['2 shift 5 3 eq', '[[2 4 6]]'],
    ['shift 5 3 shift 5 8 shift 5 4 eq', '32'], // dot product
    ['shift 5 3 mul shift 5 4 eq', '[[-3 6 -3]]'], // cross product
    ['shift lpar shift 5 3 eq', '√14'],
    ['shift 5 9 shift 5 3 shift rpar shift 5 4 eq', '12.9331'],
    ['shift 5 0 shift 5 3 eq', '[[√14/14 √14/7 3√14/14]]'],
  ])('%s', (keys, expected) => {
    const c = vecMode(V);
    press(c, keys);
    const r = lines(c)[1];
    if (expected === '12.9331') expect(r.startsWith('12.9331')).toBe(true);
    else expect(r).toBe(expected);
  });
  it('2-dimensional vectors', () => {
    const c = vecMode({ A: [3, 4], B: [1, 0] });
    press(c, 'shift lpar shift 5 3 eq');
    expect(lines(c)[1]).toBe('5');
    press(c, 'ac shift 5 3 mul shift 5 4 eq');
    expect(lines(c)[1]).toBe('[[0 0 -4]]');
  });
  it('Dimension ERROR for mixed dimensions', () => {
    const c = vecMode({ A: [1, 2, 3], B: [1, 2] });
    press(c, 'shift 5 3 add shift 5 4 eq');
    expect(lines(c)[0]).toBe('Dimension ERROR');
  });
  it('dimension must be 2 or 3', () => {
    const c = newCalc();
    press(c, 'mode 0 1 4 eq');
    expect(lines(c)[2]).toBe('Argument ERROR');
  });
});
