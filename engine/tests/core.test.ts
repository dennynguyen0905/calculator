import Decimal from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { D } from '../src/dec';
import { exAdd, exInv, exMul, exPowInt, exQ, exSqrt, exSub, exToDecimal, exToQ, sqrtQ, type Ex } from '../src/exact';
import { gcd, isqrt, iroot, squareFreeSplit } from '../src/bigmath';
import * as F from '../src/mathfn';
import * as N from '../src/num';
import { Q } from '../src/rational';

const sqrtEx = (r: number): Ex => [{ p: 0, r: BigInt(r), c: Q.ONE }];

describe('bigmath', () => {
  it('isqrt / iroot are exact floors', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 40n }), (n) => {
        const s = isqrt(n);
        expect(s * s <= n).toBe(true);
        expect((s + 1n) * (s + 1n) > n).toBe(true);
        const c = iroot(n, 3);
        expect(c ** 3n <= n).toBe(true);
        expect((c + 1n) ** 3n > n).toBe(true);
      }),
    );
  });
  it('squareFreeSplit reconstructs', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 15n }), (n) => {
        const { s, r } = squareFreeSplit(n);
        expect(s * s * r).toBe(n);
      }),
    );
  });
  it('gcd', () => {
    expect(gcd(12n, 18n)).toBe(6n);
    expect(gcd(0n, 5n)).toBe(5n);
  });
});

describe('Q', () => {
  it('field axioms on random rationals', () => {
    const q = fc.tuple(fc.bigInt({ min: -1000n, max: 1000n }), fc.bigInt({ min: 1n, max: 1000n })).map(([n, d]) => Q.of(n, d));
    fc.assert(
      fc.property(q, q, q, (a, b, c) => {
        expect(a.add(b).eq(b.add(a))).toBe(true);
        expect(a.mul(b.add(c)).eq(a.mul(b).add(a.mul(c)))).toBe(true);
        if (!a.isZero) expect(a.mul(a.inv()).eq(Q.ONE)).toBe(true);
      }),
    );
  });
});

describe('Ex (exact ring)', () => {
  it('sqrt products simplify', () => {
    expect(exMul(sqrtEx(2), sqrtQ(Q.of(8)))).toEqual(exQ(Q.of(4)));
    expect(exToQ(exMul(sqrtEx(3), sqrtEx(3)))).toEqual(Q.of(3));
  });
  it('inverse of radical sums is exact', () => {
    const a = exAdd(sqrtEx(2), sqrtEx(3));
    const inv = exInv(a)!;
    expect(exToQ(exMul(a, inv))).toEqual(Q.ONE);
    const b = exAdd(exAdd(sqrtEx(2), sqrtEx(3)), sqrtEx(5));
    expect(exToQ(exMul(b, exInv(b)!))).toEqual(Q.ONE);
  });
  it('no inverse for 1+π', () => {
    expect(exInv([...exQ(Q.ONE), { p: 1, r: 1n, c: Q.ONE }])).toBeNull();
  });
  it('denesting', () => {
    const x = exAdd(exQ(Q.of(3)), [{ p: 0, r: 2n, c: Q.of(2) }]);
    const s = exSqrt(x)!;
    expect(exToDecimal(s).sub(new D(2).sqrt().add(1)).abs().lt(1e-40)).toBe(true);
  });
  it('powers match repeated multiplication', () => {
    const a = exAdd(exQ(Q.ONE), sqrtEx(2));
    expect(exPowInt(a, 3)).toEqual(exMul(exMul(a, a), a));
    expect(exMul(exPowInt(a, -2)!, exPowInt(a, 2)!)).toEqual(exQ(Q.ONE));
  });
  it('numeric value agrees with decimal evaluation (property)', () => {
    const term = fc.tuple(fc.integer({ min: -9, max: 9 }), fc.constantFrom(1, 2, 3, 5, 6, 7, 10));
    const ex = fc.array(term, { minLength: 1, maxLength: 3 }).map((ts) =>
      ts.reduce<Ex>((acc, [c, r]) => exAdd(acc, [{ p: 0, r: BigInt(r), c: Q.of(c) }]), []),
    );
    fc.assert(
      fc.property(ex, ex, (a, b) => {
        const lhs = exToDecimal(exMul(a, b));
        const rhs = exToDecimal(a).mul(exToDecimal(b));
        expect(lhs.sub(rhs).abs().lt(1e-45)).toBe(true);
        const s = exToDecimal(exSub(a, b));
        expect(s.sub(exToDecimal(a).sub(exToDecimal(b))).abs().lt(1e-45)).toBe(true);
      }),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Property test: the decimal engine vs decimal.js at high precision (120 digits as the reference).
// The engine stores 15 significant digits, so every result must agree with the true value to <= 1e-14 relative.
// ---------------------------------------------------------------------------------------------
const Ref = Decimal.clone({ precision: 120 });

function relErr(got: Decimal, want: Decimal): number {
  if (want.isZero()) return got.abs().toNumber();
  return got.sub(want).abs().div(want.abs()).toNumber();
}

describe('decimal engine vs decimal.js (high precision)', () => {
  const dec = fc.double({ min: 1e-5, max: 1e5, noNaN: true }).map((x) => new Ref(x.toPrecision(14)));
  const toNum = (x: Decimal): N.Num => N.na(new D(x.toString()));

  it('+ - × ÷', () => {
    fc.assert(
      fc.property(dec, dec, (a, b) => {
        const A = toNum(a);
        const B = toNum(b);
        const ra = new Ref(N.toDec(A).toString());
        const rb = new Ref(N.toDec(B).toString());
        expect(relErr(new Ref(N.toDec(N.mul(A, B)).toString()), ra.mul(rb))).toBeLessThan(1e-14);
        expect(relErr(new Ref(N.toDec(N.div(A, B)).toString()), ra.div(rb))).toBeLessThan(1e-14);
        expect(relErr(new Ref(N.toDec(N.add(A, B)).toString()), ra.add(rb))).toBeLessThan(1e-14);
      }),
      { numRuns: 300 },
    );
  });

  it('sqrt, ln, exp, sin, cos, atan', () => {
    fc.assert(
      fc.property(dec, (a) => {
        const A = toNum(a);
        const ra = new Ref(N.toDec(A).toString());
        expect(relErr(new Ref(N.toDec(N.sqrt(A)).toString()), ra.sqrt())).toBeLessThan(1e-14);
        expect(relErr(new Ref(N.toDec(F.ln(A)).toString()), ra.ln())).toBeLessThan(1e-14);
        const small = ra.mod(7); // keep exp in range
        expect(relErr(new Ref(N.toDec(F.exp(toNum(small))).toString()), new Ref(N.toDec(toNum(small)).toString()).exp())).toBeLessThan(1e-14);
        const rad = ra.mod(100);
        const radN = toNum(rad);
        const rr = new Ref(N.toDec(radN).toString());
        expect(Math.abs(N.toNumber(F.sin(radN, 'rad')) - rr.sin().toNumber())).toBeLessThan(1e-14);
        expect(Math.abs(N.toNumber(F.cos(radN, 'rad')) - rr.cos().toNumber())).toBeLessThan(1e-14);
        expect(relErr(new Ref(N.toDec(F.atan(A, 'rad')).toString()), ra.atan())).toBeLessThan(1e-14);
      }),
      { numRuns: 100 },
    );
  });

  it('x^y', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 50, noNaN: true }), fc.double({ min: -5, max: 5, noNaN: true }), (x, y) => {
        const X = toNum(new Ref(x.toPrecision(12)));
        const Y = toNum(new Ref(y.toPrecision(12)));
        const want = new Ref(N.toDec(X).toString()).pow(new Ref(N.toDec(Y).toString()));
        expect(relErr(new Ref(N.toDec(N.pow(X, Y)).toString()), want)).toBeLessThan(1e-13);
      }),
      { numRuns: 200 },
    );
  });

  it('exact rationals never lose precision', () => {
    const q = fc.tuple(fc.integer({ min: -9999, max: 9999 }), fc.integer({ min: 1, max: 9999 }));
    fc.assert(
      fc.property(q, q, ([a, b], [c, d]) => {
        const x = N.fromQ(Q.of(a, b));
        const y = N.fromQ(Q.of(c, d));
        const sum = N.add(x, y);
        expect(sum.t).toBe('x');
        expect(N.rationalOf(sum)!.eq(Q.of(a, b).add(Q.of(c, d)))).toBe(true);
      }),
    );
  });
});
