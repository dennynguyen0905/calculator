import { describe, expect, it } from 'vitest';
import { fromText } from '../src/text';
import { evalBaseAst, toRadixString } from '../src/modes/basen';
import { parse } from '../src/parser';
import { lines, newCalc, press } from './keyhelpers';

/** translate a compact string into key ids: digits, A-F, + - * / ( ), and the menu words */
const K: Record<string, string> = {
  A: 'alpha neg',
  B: 'alpha dms',
  C: 'alpha hyp',
  D: 'alpha sin',
  E: 'alpha cos',
  F: 'alpha tan',
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '(': 'lpar',
  ')': 'rpar',
  '~': 'shift 3 5', // Neg(
  '!': 'shift 3 6', // Not(
  '&': 'shift 3 7', // and
  '|': 'shift 3 8', // or
  '^': 'shift 3 9', // xor
  '=': 'shift 3 0', // xnor
  d: 'shift 3 1',
  h: 'shift 3 2',
  b: 'shift 3 3',
  o: 'shift 3 4',
};
const keys = (s: string): string =>
  [...s]
    .map((ch) => K[ch] ?? ch)
    .join(' ');

const BASE_KEY = { dec: 'sq', hex: 'pow', bin: 'log', oct: 'ln' } as const;

function base(radix: keyof typeof BASE_KEY, expr: string): string {
  const c = newCalc();
  press(c, 'mode 3');
  press(c, BASE_KEY[radix]);
  press(c, `${keys(expr)} eq`);
  return lines(c)[1] ?? '';
}
function baseErr(radix: keyof typeof BASE_KEY, expr: string): string {
  const c = newCalc();
  press(c, 'mode 3');
  press(c, BASE_KEY[radix]);
  press(c, `${keys(expr)} eq`);
  return lines(c)[0];
}

describe('BASE-N: decimal', () => {
  it.each<[string, string]>([
    ['1+1', '2'],
    ['5-10', '-5'],
    ['7/2', '3'],
    ['-7/2', '-3'],
    ['100*100', '10000'],
    ['2147483647', '2147483647'],
    ['-2147483648', '-2147483648'],
    ['2147483646+1', '2147483647'],
    ['!0', '-1'],
    ['~5', '-5'],
    ['5&3', '1'],
    ['5|3', '7'],
    ['5^3', '6'],
    ['5=3', '-7'],
    ['!5', '-6'],
    ['(1+2)*3', '9'],
    ['hFF', '255'],
    ['hFF+d1', '256'],
    ['b101+1', '6'],
    ['o17+1', '16'],
  ])('%s = %s', (expr, expected) => {
    expect(base('dec', expr)).toBe(expected);
  });
  it.each<string>(['2147483647+1', '2147483647*2', '-2147483648-1', '2147483648', '1/0'])('%s is Math ERROR', (expr) => {
    expect(baseErr('dec', expr)).toBe('Math ERROR');
  });
  it('rejects non-integers and unsupported functions', () => {
    const c = newCalc();
    press(c, 'mode 3 1 dot 5 eq');
    expect(lines(c)[1]).toBe('15'); // "." is ignored in BASE-N
    press(c, 'ac sin 1 eq');
    expect(lines(c)[0]).toBe('Syntax ERROR');
  });
});

describe('BASE-N: hexadecimal', () => {
  it.each<[string, string]>([
    ['FF+1', '100'],
    ['7FFFFFFE+1', '7FFFFFFF'],
    ['FFFFFFFF', 'FFFFFFFF'],
    ['FFFFFFFF+1', '0'],
    ['A0&FF', 'A0'],
    ['1F*2', '3E'],
    ['80000000', '80000000'],
    ['!0', 'FFFFFFFF'],
    ['~1', 'FFFFFFFF'],
    ['0-1', 'FFFFFFFF'],
    ['F0|0F', 'FF'],
    ['FF^0F', 'F0'],
    ['A/3', '3'],
    ['d10+1', 'B'],
    ['b1010', 'A'],
    ['FFFFFFFF/2', '0'], // -1 / 2 truncates to 0
  ])('%s = %s', (expr, expected) => {
    expect(base('hex', expr)).toBe(expected);
  });
  it('7FFFFFFF+1 overflows', () => {
    expect(baseErr('hex', '7FFFFFFF+1')).toBe('Math ERROR');
  });
  it('9 digits is too long', () => {
    expect(baseErr('hex', '100000000')).toBe('Math ERROR');
  });
});

describe('BASE-N: binary and octal', () => {
  it.each<[string, string]>([
    ['1010+11', '1101'],
    ['1010&110', '10'],
    ['!0', '11111111111111111111111111111111'],
    ['0-1', '11111111111111111111111111111111'],
    ['1111|10000', '11111'],
    ['11*11', '1001'],
    ['1000/10', '100'],
  ])('bin %s = %s', (expr, expected) => {
    expect(base('bin', expr)).toBe(expected);
  });
  it.each<[string, string]>([
    ['17+1', '20'],
    ['!0', '37777777777'],
    ['7*7', '61'],
    ['0-1', '37777777777'],
  ])('oct %s = %s', (expr, expected) => {
    expect(base('oct', expr)).toBe(expected);
  });
  it('digits outside the base are ignored', () => {
    const c = newCalc();
    press(c, 'mode 3 log 1 2 0 1');
    expect(lines(c)[0]).toBe('101|');
  });
});

describe('BASE-N: base conversion keys', () => {
  it('result is re-displayed in the new base', () => {
    const c = newCalc();
    press(c, 'mode 3 2 5 5 eq');
    expect(lines(c)[1]).toBe('255');
    press(c, 'pow');
    expect(lines(c)[1]).toBe('FF');
    press(c, 'log');
    expect(lines(c)[1]).toBe('11111111');
    press(c, 'ln');
    expect(lines(c)[1]).toBe('377');
    press(c, 'sq');
    expect(lines(c)[1]).toBe('255');
  });
  it('status shows the base', () => {
    const c = newCalc();
    press(c, 'mode 3 pow');
    expect(c.screen.status.mode).toBe('HEX');
  });
});

describe('BASE-N: evaluator and formatter units', () => {
  const ev = (s: string, radix = 10) => evalBaseAst(parse(fromText(s), radix, true), 0n, 0n);
  it('two complement formatting', () => {
    expect(toRadixString(-1n, 16)).toBe('FFFFFFFF');
    expect(toRadixString(-2147483648n, 2)).toBe('1' + '0'.repeat(31));
    expect(toRadixString(-2147483648n, 8)).toBe('20000000000');
    expect(toRadixString(2147483647n, 16)).toBe('7FFFFFFF');
  });
  it('arithmetic', () => {
    expect(ev('2+3*4')).toBe(14n);
    expect(ev('2147483647')).toBe(2147483647n);
    expect(() => ev('2147483648')).toThrow();
    expect(ev('FFFFFFFF', 16)).toBe(-1n);
  });
});
