import { describe, expect, it } from 'vitest';
import { intervalNode, solveInequality, type Rel } from '../src/modes/ineq';
import { plain } from '../src/format/rnode';
import * as N from '../src/num';
import { defaultSetup } from '../src/settings';
import { lines, newCalc, press } from './keyhelpers';

const setup = defaultSetup();
const sol = (co: number[], rel: Rel): string[] => {
  const ivs = solveInequality(co.map((x) => N.fromInt(x)), rel);
  if (ivs.length === 0) return ['No solution'];
  return ivs.map((iv) => plain(intervalNode(iv, setup, false)));
};

describe('quadratic inequalities', () => {
  it.each<[number[], Rel, string[]]>([
    [[1, -3, 2], '>', ['x<1', '2<x']],
    [[1, -3, 2], '<', ['1<x<2']],
    [[1, -3, 2], '≥', ['x≤1', '2≤x']],
    [[1, -3, 2], '≤', ['1≤x≤2']],
    [[1, 0, 1], '>', ['All real numbers']],
    [[1, 0, 1], '<', ['No solution']],
    [[1, 0, 0], '≥', ['All real numbers']],
    [[1, 0, 0], '>', ['x<0', '0<x']],
    [[1, 0, 0], '≤', ['x=0']],
    [[1, 0, 0], '<', ['No solution']],
    [[1, 0, -2], '>', ['x<-√2', '√2<x']],
    [[1, -1, -1], '≤', ['(1-√5)/2≤x≤(1+√5)/2']],
    [[-1, 0, 4], '>', ['-2<x<2']],
    [[-1, 0, 4], '≤', ['x≤-2', '2≤x']],
    [[1, 2, 1], '>', ['x<-1', '-1<x']],
    [[1, 2, 1], '≥', ['All real numbers']],
    [[1, 1, 1], '>', ['All real numbers']],
    [[1, 1, 1], '≤', ['No solution']],
    [[2, -3, 1], '<', ['1/2<x<1']],
  ])('%j %s', (co, rel, expected) => {
    expect(sol(co, rel)).toEqual(expected);
  });
});

describe('cubic and quartic inequalities', () => {
  it.each<[number[], Rel, string[]]>([
    [[1, -6, 11, -6], '>', ['1<x<2', '3<x']],
    [[1, -6, 11, -6], '≤', ['x≤1', '2≤x≤3']],
    [[1, 0, 0, 0], '>', ['0<x']],
    [[1, 0, 0, 0], '≥', ['0≤x']],
    [[1, 0, 0, 1], '<', ['x<-1']],
    [[1, 0, -5, 0, 4], '<', ['-2<x<-1', '1<x<2']],
    [[1, 0, -5, 0, 4], '≥', ['x≤-2', '-1≤x≤1', '2≤x']],
    [[1, 0, 0, 0, 1], '>', ['All real numbers']],
    [[1, -4, 6, -4, 1], '>', ['x<1', '1<x']], // (x-1)^4
  ])('%j %s', (co, rel, expected) => {
    expect(sol(co, rel)).toEqual(expected);
  });
});

describe('INEQ key flow', () => {
  it('x^2 - 3x + 2 > 0', () => {
    const c = newCalc();
    press(c, 'mode 5 1 1'); // quadratic, ">"
    press(c, '1 eq neg 3 eq 2 eq');
    expect(lines(c)).toEqual(['x<1', '2<x']);
  });
  it('shows "All real numbers"', () => {
    const c = newCalc();
    press(c, 'mode 5 1 1 1 eq 0 eq 1 eq');
    expect(lines(c)[0]).toBe('All real numbers');
  });
});
