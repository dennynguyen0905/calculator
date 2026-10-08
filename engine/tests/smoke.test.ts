import { describe, expect, it } from 'vitest';
import { calc, newMachine } from '../src/calc';

describe('smoke', () => {
  it('basic', () => {
    expect(calc('1+1')).toBe('2');
    expect(calc('1/3+1/6'.replace(/\//g, '÷'))).toBe('1/2');
    expect(calc('sqrt(8)')).toBe('2√2');
    expect(calc('sin(45)')).toBe('√2/2');
    expect(calc('(sqrt(3)+1)^2'.replace('^2', '^2'))).toBe('4+2√3');
    expect(calc('1÷3')).toBe('1/3');
    expect(calc('0.1+0.2')).toBe('0.3');
    expect(calc('2^0.5')).toBe('1.414213562');
    expect(calc('sin(30)')).toBe('1/2');
    expect(calc('tan(90)')).toBe('Math ERROR');
  });
  it('machine', () => {
    const m = newMachine();
    expect(calc('1÷3', m, { toggled: true })).toBe('0.3333333333');
  });
});
