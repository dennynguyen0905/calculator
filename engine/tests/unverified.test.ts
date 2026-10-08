// Tests that pin down ASSUMPTIONS about the real device (see docs/ASSUMPTIONS.md).
// Each entry is marked `// UNVERIFIED`: it documents what this emulator does, not confirmed device behaviour.
import { describe, expect, it } from 'vitest';
import { c } from './helpers';
import { lines, newCalc, press } from './keyhelpers';
import { defaultSetup } from '../src/settings';
import { formatPlain } from '../src/format/value';
import * as N from '../src/num';
import { solvePolynomial } from '../src/poly';
import { computeStats } from '../src/stat';
import { Q } from '../src/rational';

describe('UNVERIFIED assumptions', () => {
  it('N2: decimal-flagged exact value can be toggled to a fraction', () => {
    // UNVERIFIED
    expect(c('0.1+0.2')).toBe('0.3');
    expect(c('0.1+0.2', { toggled: true })).toBe('3/10');
    expect(c('0.5', { toggled: true })).toBe('1/2');
  });
  it('N4: >10 digit fractions fall back to decimal', () => {
    // UNVERIFIED
    expect(c('1÷12345678901')).toBe('8.100000073×10^-11');
  });
  it('N6: term ordering of radical sums', () => {
    // UNVERIFIED
    expect(c('sin(15)')).toBe('(√6-√2)/4');
    expect(c('tan(15)')).toBe('2-√3');
    expect(c('1÷(sqrt(3)-1)')).toBe('(1+√3)/2');
    expect(c('pi×sqrt(2)')).toBe('√2π');
  });
  it('N8: nested radicals are de-nested', () => {
    // UNVERIFIED
    expect(c('sqrt(3+2sqrt(2))')).toBe('1+√2');
  });
  it('N9: 2^0.5 can be toggled to the exact radical', () => {
    // UNVERIFIED
    expect(c('2^0.5')).toBe('1.414213562');
    expect(c('2^0.5', { toggled: true })).toBe('√2');
  });
  it('N10: percent is plain division by 100', () => {
    // UNVERIFIED
    expect(c('50%')).toBe('1/2');
  });
  it('S4: stack accounting', () => {
    // UNVERIFIED
    expect(c('(((((((((((((((((((((((((1)))))))))))))))))))))))))')).toBe('Stack ERROR');
  });
  it('F7: Int truncates, Intg floors', () => {
    // UNVERIFIED
    expect(c('Int(-5.7)')).toBe('-5');
    expect(c('Intg(-5.7)')).toBe('-6');
  });
  it('F8: ÷R display', () => {
    // UNVERIFIED
    expect(c('17÷R5')).toBe('3 R 2');
  });
  it('F10: DMS entry', () => {
    // UNVERIFIED
    expect(c('1°30′0″')).toBe('1.5');
    expect(c('1°30′0″', { toggled: true })).toBe('3/2');
  });
  it('F11: integral of sqrt(x) near a singular derivative is accurate to ~1e-9', () => {
    // UNVERIFIED
    expect(c('int(0,1,sqrt(X))')).toBe('0.6666666667');
  });

  // ---------------------------------------------------------------- modes added later

  it('E1: quadratic roots are listed (-b+√D)/2a first; higher degrees ascending by real part', () => {
    // UNVERIFIED
    const co = (...x: number[]) => x.map((v) => N.fromInt(v));
    const f = (r: { roots: Parameters<typeof formatPlain>[0][] }) => r.roots.map((v) => formatPlain(v, defaultSetup()));
    expect(f(solvePolynomial(co(1, -3, 2)))).toEqual(['2', '1']);
    expect(f(solvePolynomial(co(1, -6, 11, -6)))).toEqual(['1', '2', '3']);
  });
  it('E2: a repeated root is shown once as "x="', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode 4 2 1 1 eq 2 eq 1 eq');
    expect(lines(k)).toEqual(['x=-1']);
  });
  it('E3: a singular simultaneous system is a Math ERROR', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode 4 1 1 1 eq 2 eq 3 eq 2 eq 4 eq 6 eq');
    expect(lines(k)[0]).toBe('Math ERROR');
  });
  it('I1: inequality results are listed one interval per row', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode 5 1 1 1 eq neg 3 eq 2 eq');
    expect(lines(k)).toEqual(['x<1', '2<x']);
  });
  it('T1: statistic sums of ln/e^/ab/pow/inv regressions use the transformed data', () => {
    // UNVERIFIED
    const rows = [1, 2, 4].map((x) => ({ x: N.fromInt(x), y: N.fromInt(x), f: N.ONE }));
    const s = computeStats('ln', rows);
    expect(formatPlain(s.sumX, defaultSetup())).toBe('2.079441542'); // ln1+ln2+ln4 = 3 ln2
  });
  it('T2: quartiles exclude the median for odd n', () => {
    // UNVERIFIED
    const s = computeStats('1var', [1, 2, 3, 4, 5].map((x) => ({ x: N.fromInt(x), f: N.ONE })));
    expect(formatPlain(s.Q1(), defaultSetup())).toBe('3/2');
    expect(formatPlain(s.Q3(), defaultSetup())).toBe('9/2');
  });
  it('T3: x̂ and ŷ are entered as functions', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode 6 2 1 eq 2 eq 3 eq right up up up 2 eq 4 eq 6 eq ac shift 1 6 5 4 eq');
    expect(lines(k)[0]).toContain('ŷ(4');
    expect(lines(k)[1]).toBe('8');
  });
  it('D1: inverse binomial/Poisson return the smallest x whose cumulative probability reaches the area', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode 7 6 dot 9 eq 1 0 eq dot 5 eq');
    expect(lines(k)).toEqual(['x=7']);
  });
  it('D2: empty Normal CD bounds default to ±1E99', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode 7 2 eq eq eq eq');
    expect(lines(k)[0]).toBe('p=1');
  });
  it('B1: BASE-N division truncates and logic works on 32-bit patterns', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode 3 7 div 2 eq');
    expect(lines(k)[1]).toBe('3');
    press(k, 'ac shift 3 6 0 eq');
    expect(lines(k)[1]).toBe('-1');
  });
  it('C1: in CMPLX mode a real result stays real even with r∠θ output', () => {
    // UNVERIFIED
    expect(c('-1', { complex: true, polar: true })).toBe('-1');
  });
  it('C2: complex powers of negative bases use the principal value', () => {
    // UNVERIFIED
    expect(c('(-8)^(1÷3)', { complex: true })).toBe('1+1.732050808i');
  });
  it('V1: VERIFY compares exactly', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode');
    press(k, Array(12).fill('down').join(' '));
    press(k, 'eq 1 div 3 alpha calc dot 3 3 3 3 3 3 3 3 3 3 eq');
    expect(lines(k)[1]).toBe('FALSE');
  });
  it('M1: matrix results are browsed cell by cell and show decimals in the cell grid', () => {
    // UNVERIFIED
    const k = newCalc();
    press(k, 'mode 9 1 2 eq 2 eq 1 eq 2 eq 3 eq 4 eq ac shift 4 3 inv eq');
    expect(lines(k)).toEqual(['-2 1', '1.5 -0.5', '1,1:-2']);
  });
  it('Q1: Rational::of keeps lowest terms', () => {
    // UNVERIFIED (internal sanity)
    expect(Q.of(6, 4).toString()).toBe('3/2');
  });
});
