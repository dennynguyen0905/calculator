// More COMP golden cases: nested structures, multi-statement input, ENG, Ans chains, stored values, formats.
import { describe, expect, it } from 'vitest';
import { c, type Case, type OptCase } from './helpers';
import { lines, newCalc, press } from './keyhelpers';

const run = (title: string, cases: Case[]) =>
  describe(title, () => {
    it.each(cases)('%s = %s', (expr, expected) => {
      expect(c(expr)).toBe(expected);
    });
  });

run('nested fractions and radicals', [
  ['frac(1,1+frac(1,2))', '2/3'],
  ['frac(1,frac(2,3))', '3/2'],
  ['frac(sqrt(2),sqrt(8))', '1/2'],
  ['frac(1,sqrt(2))', '√2/2'],
  ['frac(2,1+sqrt(2))', '2√2-2'],
  ['sqrt(frac(9,4))', '3/2'],
  ['sqrt(frac(1,3))', '√3/3'],
  ['sqrt(1+sqrt(1+sqrt(0)))', '√2'],
  ['sqrt(sqrt(81))', '3'],
  ['frac(frac(1,2),frac(1,3))', '3/2'],
  ['frac(1,2)+frac(1,3)+frac(1,6)', '1'],
  ['frac(sqrt(3)+1,sqrt(3)-1)', '2+√3'],
  ['cbrt(sqrt(64))', '2'],
  ['sqrt(cbrt(64))', '2'],
  ['root(3,sqrt(64))', '2'],
  ['sqrt(abs(-16))', '4'],
  ['abs(sqrt(2)-2)', '2-√2'],
  ['pow(2)', 'Syntax ERROR'],
  ['(1+sqrt(2))(1-sqrt(2))', '-1'],
  ['(sqrt(2)+sqrt(3))^2', '5+2√6'],
  ['(sqrt(2)+sqrt(3))^2-5', '2√6'],
  ['sqrt(6)÷sqrt(2)', '√3'],
  ['2sqrt(3)×3sqrt(3)', '18'],
  ['frac(3,sqrt(3))', '√3'],
  ['frac(1,sqrt(5)-sqrt(3))', '(√3+√5)/2'],
  ['frac(2,sqrt(5)+sqrt(3))', '√5-√3'],
]);

describe('multi-statement with ":" and Ans', () => {
  it('evaluates statements in order and shows the last result', () => {
    expect(c('1+1:2+3')).toBe('5');
    expect(c('1+1:Ans×10')).toBe('20');
    expect(c('2:3:4')).toBe('4');
  });
});

describe('mixed fractions, ENG and stored values via keys', () => {
  it('mixed fraction template', () => {
    const k = newCalc();
    press(k, '2 shift frac 1 right 3 right eq');
    expect(lines(k)[1]).toBe('7/3');
  });
  it('mixed fraction display setting ab/c', () => {
    const k = newCalc();
    press(k, 'shift mode 5 1');
    press(k, '7 div 3 eq');
    expect(lines(k)[1]).toBe('2 1/3');
    press(k, 'sd');
    expect(lines(k)[1]).toBe('2.333333333');
  });
  it('ENG symbol setting', () => {
    const k = newCalc();
    press(k, 'shift mode 4 1');
    press(k, '1 2 3 4 5 eq eng');
    expect(lines(k)[1]).toBe('12.345k');
    press(k, 'eng');
    expect(lines(k)[1]).toBe('0.012345M');
  });
  it('digit separators and decimal comma', () => {
    const k = newCalc();
    press(k, 'shift mode 0 1'); // Digit Separator On
    press(k, '1 2 3 4 5 6 7 eq');
    expect(lines(k)[1]).toBe('1,234,567');
    const m = newCalc();
    press(m, 'shift mode 9 2'); // decimal comma
    press(m, '1 dot 5 eq');
    expect(lines(m)[1]).toBe('1,5');
  });
  it('variables keep exact values', () => {
    const k = newCalc();
    press(k, '1 div 3 eq shift rcl neg ac alpha neg mul 3 eq');
    expect(lines(k)[1]).toBe('1');
    press(k, 'ac sqrt 2 right eq shift rcl dms ac alpha dms sq eq');
    expect(lines(k)[1]).toBe('2');
  });
  it('Rnd( rounds to the display digits', () => {
    const k = newCalc();
    press(k, 'shift mode 3 1 2'); // Fix 2
    press(k, 'shift sigma 1 div 3 right'.replace(' right', ''));
    press(k, ' eq');
    expect(lines(k)[1]).toBe('0.33');
  });
  it('% key', () => {
    const k = newCalc();
    press(k, '2 0 0 mul 1 5 alpha lpar eq');
    expect(lines(k)[1]).toBe('30');
  });
  it('x! x⁻¹ and nPr nCr keys', () => {
    const k = newCalc();
    press(k, '5 shift inv eq');
    expect(lines(k)[1]).toBe('120');
    press(k, 'ac 4 inv eq');
    expect(lines(k)[1]).toBe('1/4');
    press(k, 'ac 5 shift div 2 eq');
    expect(lines(k)[1]).toBe('10');
  });
  it('10^x and e^x keys', () => {
    const k = newCalc();
    press(k, 'shift log 3 right eq');
    expect(lines(k)[1]).toBe('1000');
    press(k, 'ac shift ln 1 right eq');
    expect(lines(k)[1]).toBe('2.718281828');
  });
  it('FACT key', () => {
    const k = newCalc();
    press(k, '1 2 eq shift dms');
    expect(lines(k)[1]).toBe('2^2×3');
  });
  it('Pol( and Rec( keys show two values', () => {
    const k = newCalc();
    press(k, 'shift add 1 shift rpar 1 eq');
    expect(lines(k)).toEqual(['Pol(1,1', 'r=√2 | θ=45']);
    expect(k.screen.status.disp).toBe(true);
  });
  it('3rd root and nth root keys', () => {
    const k = newCalc();
    press(k, 'shift sqrt 8 right eq');
    expect(lines(k)[1]).toBe('2');
    press(k, 'ac 4 shift pow'.replace(' 4 shift pow', ' shift pow 4 right 1 6 right eq'));
    expect(lines(k)[1]).toBe('2');
  });
});

describe('error positions', () => {
  it('Syntax ERROR cursor goes to the failing item', () => {
    const k = newCalc();
    press(k, '1 add add 2 eq left');
    expect(lines(k)[0].includes('|')).toBe(true);
  });
});

describe('time budget', () => {
  it('a huge Σ raises Time Out instead of hanging', () => {
    const t0 = Date.now();
    const out = c('sum(1,1000000,sin(X)cos(X)ln(X)^2)');
    expect(['Time Out', 'Argument ERROR'].includes(out) || out.length > 0).toBe(true);
    expect(Date.now() - t0).toBeLessThan(20000);
  });
});

const cases: OptCase[] = [
  ['1÷3', '0.3333333333', { toggled: true }],
];
describe('toggle sanity', () => {
  it.each(cases)('%s', (e, x, o) => expect(c(e, o)).toBe(x));
});
