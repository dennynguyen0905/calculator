import { describe, expect, it } from 'vitest';
import { c, type Opt } from './helpers';
import { lines, newCalc, press } from './keyhelpers';

const cx = (expr: string, o: Opt = {}) => c(expr, { complex: true, ...o });

describe('CMPLX mode arithmetic', () => {
  it.each<[string, string]>([
    ['i', 'i'],
    ['-i', '-i'],
    ['2i', '2i'],
    ['3+4i', '3+4i'],
    ['3-4i', '3-4i'],
    ['(1+2i)(3-4i)', '11+2i'],
    ['(1+2i)+(3-4i)', '4-2i'],
    ['(1+2i)-(1+2i)', '0'],
    ['i^2', '-1'],
    ['i^3', '-i'],
    ['i^4', '1'],
    ['(1+i)^2', '2i'],
    ['(1+i)^3', '-2+2i'],
    ['1÷i', '-i'],
    ['(2+3i)÷(1-i)', '-1/2+5/2i'],
    ['(1+i)(1-i)', '2'],
    ['i×i', '-1'],
    ['(3+4i)÷5', '3/5+4/5i'],
    ['2(1+i)', '2+2i'],
    ['(1.5+2.5i)×2', '3+5i'],
    ['Abs(3+4i)', '5'],
    ['Abs(1+i)', '√2'],
    ['Abs(-3)', '3'],
    ['Arg(1+i)', '45'],
    ['Arg(-1)', '180'],
    ['Arg(i)', '90'],
    ['Arg(1-i)', '-45'],
    ['Conjg(2+3i)', '2-3i'],
    ['Conjg(i)', '-i'],
    ['ReP(2+3i)', '2'],
    ['ImP(2+3i)', '3'],
    ['ImP(5)', '0'],
    ['sqrt(-1)', 'i'],
    ['sqrt(-4)', '2i'],
    ['sqrt(3+4i)', '2+i'],
    ['sqrt(-2)', '√2i'],
    ['ln(-1)', 'πi'],
    ['e^(pi i)'.replace(' ', ''), '-1'],
    ['e^i', '0.5403023059+0.8414709848i'],
    ['(-8)^(1÷3)', '1+1.732050808i'],
    ['(-1)^0.5', 'i'],
    ['2∠30', '√3+i'],
    ['2∠90', '2i'],
    ['1∠0', '1'],
    ['(1+i)÷0', 'Math ERROR'],
    ['sin(i)', '1.175201194i'],
    ['cosh(i)', '0.5403023059'],
    ['(1+i)^0', '1'],
    ['0^i', 'Math ERROR'],
  ])('%s = %s', (expr, expected) => {
    expect(cx(expr)).toBe(expected);
  });
});

describe('CMPLX mode: output format', () => {
  it.each<[string, string, Opt]>([
    ['1+i', '√2∠45', { polar: true }],
    ['3+4i', '5∠53.13010235', { polar: true }],
    ['-1', '-1', { polar: true }], // a real result stays real
    ['i', '1∠90', { polar: true }],
    ['1+i', '√2∠π/4', { polar: true, angle: 'rad' }],
    ['2∠30', '2∠30', { polar: true }],
    ['3+4i', '3+4i', { toggled: true }],
    ['(1+i)÷2', '1/2+1/2i', {}],
    ['(1+i)÷2', '0.5+0.5i', { toggled: true }],
  ])('%s -> %s', (expr, expected, o) => {
    expect(cx(expr, o)).toBe(expected);
  });
});

describe('COMP mode rejects complex input', () => {
  it.each<[string, string]>([
    ['i', 'Syntax ERROR'],
    ['sqrt(-1)', 'Math ERROR'],
    ['ln(-1)', 'Math ERROR'],
    ['(-1)^0.5', 'Math ERROR'],
    ['2∠30', 'Syntax ERROR'],
  ])('%s = %s', (expr, expected) => {
    expect(c(expr)).toBe(expected);
  });
});

describe('CMPLX key flow', () => {
  it('ENG acts as i, and ▶r∠θ / ▶a+bi convert the display', () => {
    const k = newCalc();
    press(k, 'mode 2 1 add eng eq');
    expect(lines(k)[1]).toBe('1+i');
    press(k, 'shift 2 5');
    expect(lines(k)[1]).toBe('√2∠45');
    press(k, 'shift 2 6');
    expect(lines(k)[1]).toBe('1+i');
  });
  it('Arg( from the CMPLX menu', () => {
    const k = newCalc();
    press(k, 'mode 2 shift 2 1 1 add eng right eq'.replace(' right', ''));
    expect(lines(k)[1]).toBe('45');
  });
  it('SETUP complex format r∠θ', () => {
    const k = newCalc();
    press(k, 'mode 2 shift mode 6 2 1 add eng eq');
    expect(lines(k)[1]).toBe('√2∠45');
  });
});
