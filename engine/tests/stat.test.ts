import { describe, expect, it } from 'vitest';
import { formatPlain } from '../src/format/value';
import * as N from '../src/num';
import { defaultSetup } from '../src/settings';
import { Q } from '../src/rational';
import { computeStats, type StatRow, type StatType } from '../src/stat';
import { lines, newCalc, press } from './keyhelpers';

const setup = defaultSetup();
const f = (v: Num): string => formatPlain(v, setup);
type Num = N.Num;
const n = (x: number | string): Num => {
  if (typeof x === 'number') return N.fromInt(x);
  const [a, b = '1'] = x.split('/');
  return N.fromQ(Q.of(BigInt(a), BigInt(b)));
};
const one = (xs: (number | [number, number])[]): StatRow[] => xs.map((x) => (Array.isArray(x) ? { x: n(x[0]), f: n(x[1]) } : { x: n(x), f: N.ONE }));
const two = (pts: [number, number][]): StatRow[] => pts.map(([x, y]) => ({ x: n(x), y: n(y), f: N.ONE }));

describe('one-variable statistics', () => {
  const s = computeStats('1var', one([1, 2, 3, 4, 5]));
  it('basic sums', () => {
    expect(f(s.n)).toBe('5');
    expect(f(s.sumX)).toBe('15');
    expect(f(s.sumX2)).toBe('55');
    expect(f(s.meanX)).toBe('3');
  });
  it('exact standard deviations', () => {
    expect(f(s.sigmaX())).toBe('√2');
    expect(f(s.sx())).toBe('√10/2');
  });
  it('quartiles, min, max', () => {
    expect(f(s.Q1())).toBe('3/2');
    expect(f(s.Med())).toBe('3');
    expect(f(s.Q3())).toBe('9/2');
    expect(f(s.minX())).toBe('1');
    expect(f(s.maxX())).toBe('5');
  });
  it('classic data set', () => {
    const t = computeStats('1var', one([2, 4, 4, 4, 5, 5, 7, 9]));
    expect(f(t.meanX)).toBe('5');
    expect(f(t.sigmaX())).toBe('2');
    expect(f(t.sx())).toBe('4√14/7');
    expect(f(t.Q1())).toBe('4');
    expect(f(t.Med())).toBe('9/2');
    expect(f(t.Q3())).toBe('6');
  });
  it('frequencies', () => {
    const t = computeStats('1var', one([[1, 2], [2, 3], [3, 1]]));
    expect(f(t.n)).toBe('6');
    expect(f(t.sumX)).toBe('11');
    expect(f(t.meanX)).toBe('11/6');
    expect(f(t.Med())).toBe('2');
  });
  it('single data point has no sample deviation', () => {
    const t = computeStats('1var', one([4]));
    expect(f(t.sigmaX())).toBe('0');
    expect(() => t.sx()).toThrow(/Math/);
  });
  it('empty data', () => {
    const t = computeStats('1var', []);
    expect(() => t.sigmaX()).toThrow(/Math/);
  });
  it('decimals', () => {
    const t = computeStats('1var', [{ x: N.fromQ(Q.of(15, 10), true), f: N.ONE }, { x: N.fromQ(Q.of(25, 10), true), f: N.ONE }]);
    expect(f(t.meanX)).toBe('2');
  });
});

describe('regression', () => {
  const lin = computeStats('lin', two([[1, 2], [2, 4], [3, 5], [4, 4], [5, 5]]));
  it('linear: sums and coefficients', () => {
    expect(f(lin.sumXY)).toBe('66');
    expect(f(lin.sumY2)).toBe('86');
    expect(f(lin.A())).toBe('11/5');
    expect(f(lin.B())).toBe('3/5');
    expect(f(lin.r())).toBe('√15/5');
    expect(f(lin.meanY)).toBe('4');
  });
  it('linear: predictions', () => {
    expect(f(lin.yhat(n(6)))).toBe('29/5');
    expect(f(lin.xhat(n(5)))).toBe('14/3');
  });
  it('quadratic fit is exact', () => {
    const q = computeStats('quad', two([[1, 2], [2, 3], [3, 6], [4, 11]]));
    expect(f(q.A())).toBe('3');
    expect(f(q.B())).toBe('-2');
    expect(f(q.C())).toBe('1');
    expect(f(q.yhat(n(5)))).toBe('18');
    expect(f(q.xhat(n(6), 1))).toBe('3');
    expect(f(q.xhat(n(6), 2))).toBe('-1');
    expect(() => q.r()).toThrow(/Math/);
  });
  it.each<[StatType, [number, number][], string, string]>([
    ['ab', [[1, 6], [2, 12], [3, 24]], '3', '2'],
    ['pow', [[1, 2], [2, 16], [3, 54]], '2', '3'],
    ['ln', [[1, 1], [2, 1 + 2 * Math.LN2], [4, 1 + 4 * Math.LN2]], '1', '2'],
    ['inv', [[1, 8], [2, 5], [3, 4], [6, 3]], '2', '6'],
    ['exp', [[0, 2], [1, 2 * Math.E], [2, 2 * Math.E ** 2]], '2', '1'],
  ])('%s regression', (type, pts, A, B) => {
    const rows: StatRow[] = pts.map(([x, y]) => ({ x: n(x), y: type === 'ln' || type === 'exp' ? N.na(new (N.toDec(N.ONE).constructor as new (v: number) => ReturnType<typeof N.toDec>)(y)) : n(y), f: N.ONE }));
    const s = computeStats(type, rows);
    expect(f(s.A())).toBe(A);
    expect(f(s.B())).toBe(B);
    expect(f(s.r())).toBe('1');
  });
  it('errors', () => {
    const same = computeStats('lin', two([[1, 1], [1, 2]]));
    expect(() => same.A()).toThrow(/Math/);
  });
});

describe('STAT key flow', () => {
  it('1-VAR: x̄, σx, sx', () => {
    const c = newCalc();
    press(c, 'mode 6 1'); // STAT, 1-VAR
    press(c, '1 eq 2 eq 3 eq 4 eq 5 eq ac');
    press(c, 'shift 1 4 2 eq'); // Var -> x̄
    expect(lines(c)[1]).toBe('3');
    press(c, 'ac shift 1 4 3 eq');
    expect(lines(c)[1]).toBe('√2');
    press(c, 'ac shift 1 4 4 eq');
    expect(lines(c)[1]).toBe('√10/2');
    press(c, 'ac shift 1 4 1 eq');
    expect(lines(c)[1]).toBe('5');
  });
  it('quartiles and sums', () => {
    const c = newCalc();
    press(c, 'mode 6 1 1 eq 2 eq 3 eq 4 eq 5 eq ac');
    press(c, 'shift 1 5 2 eq'); // MinMax -> Q1
    expect(lines(c)[1]).toBe('3/2');
    press(c, 'ac shift 1 3 1 eq'); // Sum -> Σx²
    expect(lines(c)[1]).toBe('55');
  });
  it('2-variable regression', () => {
    const c = newCalc();
    press(c, 'mode 6 2'); // A+BX
    press(c, '1 eq 2 eq 3 eq 4 eq 5 eq');
    // move to the y column
    press(c, 'right');
    press(c, 'up up up up up');
    press(c, '2 eq 4 eq 5 eq 4 eq 5 eq ac');
    press(c, 'shift 1 6 1 eq'); // Reg -> A
    expect(lines(c)[1]).toBe('11/5');
    press(c, 'ac shift 1 6 2 eq');
    expect(lines(c)[1]).toBe('3/5');
    press(c, 'ac shift 1 6 3 eq'); // r
    expect(lines(c)[1]).toBe('√15/5');
  });
  it('ŷ( and x̂(', () => {
    const c = newCalc();
    press(c, 'mode 6 2 1 eq 2 eq 3 eq 4 eq 5 eq right up up up up up 2 eq 4 eq 5 eq 4 eq 5 eq ac');
    press(c, 'shift 1 6 5 6 eq'); // ŷ( then 6
    expect(lines(c)[0]).toContain('ŷ(');
  });
  it('DEL deletes a data row', () => {
    const c = newCalc();
    press(c, 'mode 6 1 1 eq 2 eq 3 eq up up del');
    press(c, 'ac shift 1 4 1 eq');
    expect(lines(c)[1]).toBe('2');
  });
  it('empty data gives Math ERROR for statistics', () => {
    const c = newCalc();
    press(c, 'mode 6 1 ac shift 1 4 2 eq');
    expect(lines(c)[0]).toBe('Math ERROR');
  });
  it('persistence keeps the data', () => {
    const a = newCalc();
    press(a, 'mode 6 1 1 eq 2 eq 3 eq ac');
    const j = JSON.parse(JSON.stringify(a.serialize()));
    const b = newCalc();
    b.restore(j);
    expect(b.mode).toBe('STAT');
    press(b, 'shift 1 4 2 eq');
    expect(lines(b)[1]).toBe('2');
  });
});
