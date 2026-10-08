import { describe, expect, it } from 'vitest';
import { D } from '../src/dec';
import * as Dist from '../src/dist';
import { formatPlain } from '../src/format/value';
import * as N from '../src/num';
import { defaultSetup } from '../src/settings';
import { lines, newCalc, press } from './keyhelpers';

const setup = defaultSetup();
const f = (x: InstanceType<typeof D>): string => formatPlain(N.na(x), setup);
const d = (x: number | string) => new D(x);

describe('normal distribution', () => {
  it('pdf', () => {
    expect(f(Dist.normalPdf(d(0), d(0), d(1)))).toBe('0.3989422804');
    expect(f(Dist.normalPdf(d(1.5), d(1), d(2)))).toBe('0.1933340584');
  });
  it('cdf', () => {
    expect(f(Dist.normalCdf(d(-1), d(1), d(0), d(1)).p)).toBe('0.6826894921');
    expect(f(Dist.normalCdf(d(60), d(80), d(70), d(5)).p)).toBe('0.9544997361');
    expect(f(Dist.normalCdf(d('-1e99'), d('1.96'), d(0), d(1)).p)).toBe('0.9750021049');
    expect(f(Dist.normalCdf(d('-1e99'), d(-8), d(0), d(1)).p)).toBe('6.220960574×10^-16');
    const r = Dist.normalCdf(d(60), d(80), d(70), d(5));
    expect(f(r.zlow)).toBe('-2');
    expect(f(r.zup)).toBe('2');
  });
  it('inverse', () => {
    expect(f(Dist.inverseNormal(d('0.975'), d(0), d(1))[0])).toBe('1.959963985');
    expect(f(Dist.inverseNormal(d('0.3'), d(5), d(2))[0])).toBe('3.951198975');
    expect(f(Dist.inverseNormal(d('0.05'), d(0), d(1), 'right')[0])).toBe('1.644853627');
    expect(f(Dist.inverseNormal(d('1e-10'), d(0), d(1))[0])).toBe('-6.361340902');
    const c = Dist.inverseNormal(d('0.95'), d(0), d(1), 'central');
    expect(c.map(f)).toEqual(['-1.959963985', '1.959963985']);
  });
  it('round trip', () => {
    for (const p of ['0.001', '0.2', '0.5', '0.77', '0.999']) {
      const x = Dist.inverseNormal(d(p), d(3), d(2))[0];
      const back = Dist.normalCdf(d('-1e99'), x, d(3), d(2)).p;
      expect(back.sub(p).abs().lt(1e-14)).toBe(true);
    }
  });
  it('invalid parameters', () => {
    expect(() => Dist.normalPdf(d(0), d(0), d(0))).toThrow(/Math/);
    expect(() => Dist.inverseNormal(d(1), d(0), d(1))).toThrow(/Math/);
    expect(() => Dist.inverseNormal(d(0), d(0), d(1))).toThrow(/Math/);
  });
});

describe('binomial distribution', () => {
  it('pd and cd', () => {
    expect(f(Dist.binomialPd(d(3), d(10), d('0.5')))).toBe('0.1171875');
    expect(f(Dist.binomialCdf(d(3), d(10), d('0.5')))).toBe('0.171875');
    expect(f(Dist.binomialPd(d(50), d(100), d('0.3')))).toBe('1.302622713×10^-5');
    expect(f(Dist.binomialCdf(d(30), d(100), d('0.3')))).toBe('0.5491236008');
    expect(f(Dist.binomialCdf(d(10), d(10), d('0.5')))).toBe('1');
    expect(f(Dist.binomialPd(d(0), d(5), d(0)))).toBe('1');
    expect(f(Dist.binomialPd(d(5), d(5), d(1)))).toBe('1');
  });
  it('large n uses Stirling', () => {
    // C(1000,500) 0.5^1000 ≈ 0.02522501817
    expect(f(Dist.binomialPd(d(500), d(1000), d('0.5')))).toBe('0.02522501818');
  });
  it('inverse', () => {
    expect(f(Dist.inverseBinomial(d('0.9'), d(10), d('0.5')))).toBe('7');
    expect(f(Dist.inverseBinomial(d('0.1'), d(10), d('0.5')))).toBe('3');
  });
  it('invalid parameters', () => {
    expect(() => Dist.binomialPd(d(2.5), d(10), d('0.5'))).toThrow(/Math/);
    expect(() => Dist.binomialPd(d(3), d(10), d('1.5'))).toThrow(/Math/);
    expect(() => Dist.binomialPd(d(11), d(10), d('0.5'))).toThrow(/Math/);
    expect(() => Dist.binomialPd(d(-1), d(10), d('0.5'))).toThrow(/Math/);
  });
});

describe('Poisson distribution', () => {
  it('pd and cd', () => {
    expect(f(Dist.poissonPd(d(3), d(2)))).toBe('0.1804470443');
    expect(f(Dist.poissonCdf(d(3), d(2)))).toBe('0.8571234605');
    expect(f(Dist.poissonPd(d(20), d('15.5')))).toBe('0.04885903409');
    expect(f(Dist.poissonPd(d(0), d(1)))).toBe('0.3678794412');
  });
  it('inverse', () => {
    expect(f(Dist.inversePoisson(d('0.95'), d(3)))).toBe('6');
  });
  it('invalid parameters', () => {
    expect(() => Dist.poissonPd(d(3), d(0))).toThrow(/Math/);
    expect(() => Dist.poissonPd(d(-1), d(2))).toThrow(/Math/);
  });
});

describe('DIST key flow', () => {
  it('Normal PD with defaults', () => {
    const c = newCalc();
    press(c, 'mode 7 1');
    press(c, '0 eq eq eq');
    expect(lines(c)).toEqual(['p=0.3989422804']);
  });
  it('Normal CD shows p, ZLow, ZUp', () => {
    const c = newCalc();
    press(c, 'mode 7 2 neg 1 eq 1 eq eq eq');
    expect(lines(c)).toEqual(['p=0.6826894921', 'ZLow=-1']);
    press(c, 'down');
    expect(lines(c)).toEqual(['ZLow=-1', 'ZUp=1']);
  });
  it('Binomial PD', () => {
    const c = newCalc();
    press(c, 'mode 7 4 3 eq 1 0 eq dot 5 eq');
    expect(lines(c)).toEqual(['p=0.1171875']);
    press(c, 'ac');
    expect(lines(c)[0]).toBe('Binomial PD');
  });
  it('Inverse Normal with tail selection', () => {
    const c = newCalc();
    press(c, 'mode 7 3 1 dot 9 7 5 eq eq eq');
    expect(lines(c)).toEqual(['xInv=1.959963985']);
  });
  it('Poisson CD', () => {
    const c = newCalc();
    press(c, 'mode 7 8 3 eq 2 eq');
    expect(lines(c)).toEqual(['p=0.8571234605']);
  });
  it('Math ERROR for bad parameters', () => {
    const c = newCalc();
    press(c, 'mode 7 4 3 eq 1 0 eq 2 eq');
    expect(lines(c)[0]).toBe('Math ERROR');
  });
  it('P(, Q(, R( in STAT', () => {
    const c = newCalc();
    press(c, 'mode 6 1 ac shift 1 6 1 1 dot 9 6 eq');
    expect(lines(c)[1]).toBe('0.9750021049');
    press(c, 'ac shift 1 6 2 1 dot 9 6 eq');
    expect(lines(c)[1]).toBe('0.4750021049');
    press(c, 'ac shift 1 6 3 1 dot 9 6 eq');
    expect(lines(c)[1]).toBe('0.02499789515');
  });
});
