import { describe, expect, it } from 'vitest';
import { lines, newCalc, press } from './keyhelpers';

describe('TABLE mode', () => {
  it('f(X) prompt', () => {
    const c = newCalc();
    press(c, 'mode 8');
    expect(lines(c)[0]).toBe('f(X)=');
    press(c, 'alpha rpar sq');
    expect(lines(c)[1]).toBe('X^2|');
  });
  it('tabulates X^2 from 1 to 5', () => {
    const c = newCalc();
    press(c, 'mode 8 alpha rpar sq eq eq eq eq');
    expect(lines(c)).toEqual(['x f(x)', '1 1', '2 4', '1']);
    press(c, 'down down down');
    expect(lines(c)).toEqual(['x f(x)', '3 9', '4 16', '4']);
    press(c, 'right');
    expect(lines(c)[3]).toBe('16');
    press(c, 'down');
    expect(lines(c)).toEqual(['x f(x)', '4 16', '5 25', '25']);
  });
  it('custom range with decimals', () => {
    const c = newCalc();
    press(c, 'mode 8 alpha rpar sq eq 0 eq 1 eq dot 2 5 eq');
    expect(lines(c)[1]).toBe('0 0');
    expect(lines(c)[2]).toBe('0.25 0.0625');
    press(c, 'down down down down');
    expect(lines(c)[2]).toBe('1 1');
  });
  it('negative step', () => {
    const c = newCalc();
    press(c, 'mode 8 alpha rpar eq 5 eq 1 eq neg 2 eq');
    expect(lines(c)[1]).toBe('5 5');
    expect(lines(c)[2]).toBe('3 3');
    press(c, 'down down');
    expect(lines(c)[2]).toBe('1 1');
  });
  it('errors inside a cell show ERROR', () => {
    const c = newCalc();
    press(c, 'mode 8 1 div alpha rpar eq 0 eq 2 eq 1 eq');
    expect(lines(c)[1]).toBe('0 ERROR');
    expect(lines(c)[2]).toBe('1 1');
  });
  it('step 0 or too many rows is an Argument ERROR', () => {
    const c = newCalc();
    press(c, 'mode 8 alpha rpar eq 1 eq 5 eq 0 eq');
    expect(lines(c)[0]).toBe('Argument ERROR');
    const d = newCalc();
    press(d, 'mode 8 alpha rpar eq 1 eq 1 0 0 eq 1 eq');
    expect(lines(d)[0]).toBe('Argument ERROR');
    press(d, 'ac');
    expect(lines(d)[0]).toBe('Table range');
  });
  it('exactly 30 rows is allowed', () => {
    const c = newCalc();
    press(c, 'mode 8 alpha rpar eq 1 eq 3 0 eq 1 eq');
    expect(lines(c)[0]).toBe('x f(x)');
    press(c, Array(29).fill('down').join(' '));
    expect(lines(c)[2]).toBe('30 30');
  });
  it('f(x) and g(x) table', () => {
    const c = newCalc();
    press(c, 'shift mode 8 2'); // SETUP -> Table -> f(x),g(x)
    press(c, 'mode 8 alpha rpar sq eq alpha rpar add 1 eq eq eq eq');
    expect(lines(c)[0]).toBe('x f(x) g(x)');
    expect(lines(c)[1]).toBe('1 1 2');
    expect(lines(c)[2]).toBe('2 4 3');
  });
  it('AC goes back to the function prompt', () => {
    const c = newCalc();
    press(c, 'mode 8 alpha rpar eq eq eq eq ac');
    expect(lines(c)[0]).toBe('f(X)=');
    expect(lines(c)[1]).toBe('X|');
  });
  it('trig tables honour the angle unit', () => {
    const c = newCalc();
    press(c, 'mode 8 sin alpha rpar eq 0 eq 9 0 eq 3 0 eq');
    expect(lines(c)[1]).toBe('0 0');
    expect(lines(c)[2]).toBe('30 0.5');
  });
  it('X is restored after the table', () => {
    const c = newCalc();
    press(c, '7 eq shift rcl rpar'); // STO X
    press(c, 'mode 8 alpha rpar eq eq eq eq');
    press(c, 'mode 1 ac alpha rpar eq');
    expect(lines(c)[1]).toBe('7');
  });
  it('persistence', () => {
    const a = newCalc();
    press(a, 'mode 8 alpha rpar sq eq 2 eq 4 eq 1 eq');
    const j = JSON.parse(JSON.stringify(a.serialize()));
    const b = newCalc();
    b.restore(j);
    expect(b.mode).toBe('TABLE');
    press(b, 'mode 8');
    expect(lines(b)[1].startsWith('X^2')).toBe(true);
  });
});
