import { describe, expect, it } from 'vitest';
import type { Calculator } from '../src/calculator';
import { fromText } from '../src/text';
import { expandRefs } from '../src/modes/spread';
import { lines, newCalc, press } from './keyhelpers';

/** select the nth (0-based) entry of the MODE menu with ▼ and = */
function goMode(c: Calculator, idx: number): void {
  press(c, 'mode');
  press(c, Array(idx).fill('down').join(' '));
  press(c, 'eq');
}

describe('OPTN menu', () => {
  it.each<[string, string]>([
    ['shift 6 1 1 2 shift rpar 1 8 eq', '6'], // GCD(12,18
    ['shift 6 2 4 shift rpar 6 eq', '12'], // LCM(4,6
    ['shift 6 3 5 dot 7 eq', '5'], // Int(5.7
    ['shift 6 5 1 7 shift rpar 5 eq', '2'], // Rem(17,5
    ['shift 6 6 1 7 shift rpar 5 eq', '3'], // Quotient(17,5
    ['shift 6 0 6 0 eq', '2^2×3×5'], // Fact(60
  ])('%s', (keys, expected) => {
    const c = newCalc();
    press(c, keys);
    expect(lines(c)[1]).toBe(expected);
  });
  it('Ran# and RanInt# are in range', () => {
    const c = newCalc();
    press(c, 'shift dot eq');
    const v = Number(lines(c)[1]);
    expect(v >= 0 && v < 1).toBe(true);
    const d = newCalc();
    press(d, 'shift 0 1 shift rpar 6 eq');
    const w = Number(lines(d)[1]);
    expect(Number.isInteger(w) && w >= 1 && w <= 6).toBe(true);
  });
});

describe('VERIFY mode', () => {
  const verify = (keys: string): string[] => {
    const c = newCalc();
    goMode(c, 12);
    press(c, keys);
    return lines(c);
  };
  it.each<[string, string]>([
    ['2 add 2 alpha calc 4 eq', 'TRUE'],
    ['2 add 2 alpha calc 5 eq', 'FALSE'],
    ['sin 3 0 alpha calc 1 div 2 eq', 'TRUE'],
    ['sqrt 2 right mul sqrt 2 right alpha calc 2 eq', 'TRUE'],
    ['dot 1 add dot 2 alpha calc dot 3 eq', 'TRUE'],
    ['1 div 3 alpha calc dot 3 3 3 3 3 3 3 3 3 3 eq', 'FALSE'],
    ['3 shift 6 3 2 eq', 'TRUE'], // 3 > 2
    ['3 shift 6 4 2 eq', 'FALSE'], // 3 < 2
    ['3 shift 6 5 3 eq', 'TRUE'], // 3 ≥ 3
    ['3 shift 6 6 2 eq', 'FALSE'], // 3 ≤ 2
    ['3 shift 6 2 4 eq', 'TRUE'], // 3 ≠ 4
  ])('%s', (keys, expected) => {
    expect(verify(keys)[1]).toBe(expected);
  });
  it('needs exactly one relation', () => {
    expect(verify('2 add 2 eq')[0]).toBe('Syntax ERROR');
    expect(verify('1 alpha calc 1 alpha calc 1 eq')[0]).toBe('Syntax ERROR');
    expect(verify('alpha calc 1 eq')[0]).toBe('Syntax ERROR');
  });
});

describe('RATIO mode', () => {
  const ratio = (type: number, keys: string): string[] => {
    const c = newCalc();
    goMode(c, 10);
    press(c, `${type} ${keys}`);
    return lines(c);
  };
  it('a:b = X:d', () => {
    expect(ratio(1, '2 eq 3 eq 9 eq')).toEqual(['X=6']);
    expect(ratio(1, '3 eq 4 eq 5 eq')).toEqual(['X=15/4']);
  });
  it('a:b = c:X', () => {
    expect(ratio(2, '2 eq 3 eq 4 eq')).toEqual(['X=6']);
    expect(ratio(2, '3 eq 4 eq 5 eq')).toEqual(['X=20/3']);
  });
  it('division by zero', () => {
    expect(ratio(1, '0 eq 0 eq 5 eq')[0]).toBe('Math ERROR');
  });
});

describe('SPREADSHEET mode', () => {
  it('reference merging and range expansion', () => {
    const items = expandRefs(fromText('A12+B3'));
    expect(items.map((i) => (i.k === 'c' ? i.s : '?'))).toEqual(['A12', '+', 'B3']);
    const r = expandRefs(fromText('SUM(A1:A3)'));
    expect(r.map((i) => (i.k === 'c' ? i.s : '?'))).toEqual(['SUM(', 'A1', ',', 'A2', ',', 'A3', ')']);
    const r2 = expandRefs(fromText('SUM(A1:B2)'));
    expect(r2.filter((i) => i.k === 'c' && i.s !== ',' && i.s !== ')' && i.s !== 'SUM(').length).toBe(4);
    // a lone letter stays a variable
    expect(expandRefs(fromText('A+1')).map((i) => (i.k === 'c' ? i.s : '?'))).toEqual(['A', '+', '1']);
  });
  const sheet = (keys: string): Calculator => {
    const c = newCalc();
    goMode(c, 11);
    press(c, keys);
    return c;
  };
  it('values and formulas', () => {
    const c = sheet('5 eq 7 eq alpha calc alpha neg 1 add alpha neg 2 eq');
    // cursor moved to A4; look at A3
    press(c, 'up');
    expect(lines(c).at(-1)).toBe('A3:=A1+A2');
    expect(lines(c).some((l) => l.includes('12'))).toBe(true);
  });
  it('formulas follow their inputs', () => {
    const c = sheet('5 eq 7 eq alpha calc alpha neg 1 add alpha neg 2 eq up up up 1 0 eq');
    press(c, 'down down');
    expect(lines(c).some((l) => l.startsWith('3 17'))).toBe(true);
  });
  it('range functions', () => {
    const c = sheet('1 eq 2 eq 3 eq alpha calc shift 1 1 alpha neg 1 alpha integ alpha neg 3 eq');
    press(c, 'up');
    expect(lines(c).at(-1)).toBe('A4:=SUM(A1:A3');
    expect(lines(c).join('|')).toContain('6');
  });
  it('MEAN and MAX', () => {
    const c = sheet('2 eq 4 eq 9 eq alpha calc shift 1 2 alpha neg 1 alpha integ alpha neg 3 eq alpha calc shift 1 3 alpha neg 1 alpha integ alpha neg 3 eq');
    expect(lines(c).join('|')).toContain('5');
    press(c, 'up');
    expect(lines(c).join('|')).toContain('9');
  });
  it('circular reference shows ERROR in the cell', () => {
    const c = sheet('alpha calc alpha neg 1 eq up');
    expect(lines(c).join('|')).toContain('ERROR');
  });
  it('syntax errors are reported when committing', () => {
    const c = sheet('alpha calc 1 add eq');
    expect(lines(c)[0]).toBe('Syntax ERROR');
    press(c, 'ac');
    expect(lines(c)[0]).toBe(' A B C D E');
  });
  it('DEL clears a cell, menu Del-All clears everything', () => {
    const c = sheet('5 eq up del');
    expect(lines(c).join('|')).not.toContain('5');
    const d = sheet('5 eq shift 1 6');
    expect(lines(d).join('|')).not.toContain('5');
  });
  it('persistence', () => {
    const a = sheet('5 eq 7 eq');
    const j = JSON.parse(JSON.stringify(a.serialize()));
    const b = newCalc();
    b.restore(j);
    expect(b.mode).toBe('SPREAD');
    expect(lines(b).join('|')).toContain('7');
  });
});
