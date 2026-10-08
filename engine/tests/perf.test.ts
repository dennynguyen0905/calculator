import { describe, expect, it } from 'vitest';
import { calc, newMachine } from '../src/calc';

function time(label: string, f: () => void, limitMs: number) {
  const t0 = Date.now();
  f();
  const dt = Date.now() - t0;
  it(`${label} (${dt.toFixed(1)}ms) < ${limitMs}ms`, () => expect(dt).toBeLessThan(limitMs));
}

describe('performance (feels instant)', () => {
  const m = newMachine();
  time('1000 simple evaluations', () => {
    for (let i = 0; i < 1000; i++) calc('(1+2)×3÷4+sqrt(8)', m);
  }, 1500);
  time('integral of sin(X)e^X', () => {
    calc('int(0,3,sin(X)e^X)', m);
  }, 150);
  time('integral through the exact-evaluator fallback', () => {
    calc('int(0,1,frac(1,1+X^2)+Int(X))', m);
  }, 1500);
  time('sigma 1..1000 of 1/X (exact rationals)', () => {
    calc('sum(1,1000,1÷X)', m);
  }, 1500);
  time('sigma 1..10000 of X^2', () => {
    calc('sum(1,10000,X^2)', m);
  }, 1500);
  time('100 trig evaluations', () => {
    for (let i = 0; i < 100; i++) calc('sin(0.5)+cos(0.7)×tan(0.3)', m);
  }, 800);
});
