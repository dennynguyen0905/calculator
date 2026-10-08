import { D, type Dec } from './dec';
import { babs, gcd } from './bigmath';

/** Immutable exact rational number with BigInt numerator / denominator (d > 0, lowest terms). */
export class Q {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static readonly ZERO = new Q(0n, 1n);
  static readonly ONE = new Q(1n, 1n);

  static of(n: bigint | number, d: bigint | number = 1n): Q {
    let nn = BigInt(n);
    let dd = BigInt(d);
    if (dd === 0n) throw new RangeError('Q: zero denominator');
    if (dd < 0n) {
      nn = -nn;
      dd = -dd;
    }
    if (nn === 0n) return Q.ZERO;
    if (dd === 1n) return nn === 1n ? Q.ONE : new Q(nn, 1n);
    const g = gcd(nn, dd);
    if (g !== 1n) {
      nn /= g;
      dd /= g;
    }
    if (dd === 1n && nn === 1n) return Q.ONE;
    return new Q(nn, dd);
  }

  /** Parse a plain decimal literal such as "12.5", ".5", "3." (no exponent). */
  static parseDecimal(text: string): Q {
    const m = /^(\d*)(?:\.(\d*))?$/.exec(text);
    if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) throw new SyntaxError('bad number');
    const ip = m[1] || '0';
    const fp = m[2] ?? '';
    return Q.of(BigInt(ip + fp), 10n ** BigInt(fp.length));
  }

  get sign(): -1 | 0 | 1 {
    return this.n === 0n ? 0 : this.n < 0n ? -1 : 1;
  }
  get isZero(): boolean {
    return this.n === 0n;
  }
  get isInt(): boolean {
    return this.d === 1n;
  }

  add(o: Q): Q {
    if (this.d === o.d) return Q.of(this.n + o.n, this.d);
    return Q.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q): Q {
    return this.add(o.neg());
  }
  mul(o: Q): Q {
    return Q.of(this.n * o.n, this.d * o.d);
  }
  div(o: Q): Q {
    if (o.n === 0n) throw new RangeError('Q: division by zero');
    return Q.of(this.n * o.d, this.d * o.n);
  }
  neg(): Q {
    return this.n === 0n ? this : new Q(-this.n, this.d);
  }
  abs(): Q {
    return this.n < 0n ? new Q(-this.n, this.d) : this;
  }
  inv(): Q {
    return Q.of(this.d, this.n);
  }
  cmp(o: Q): -1 | 0 | 1 {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  eq(o: Q): boolean {
    return this.n === o.n && this.d === o.d;
  }
  /** integer power (e may be negative) */
  powInt(e: number): Q {
    if (e >= 0) return Q.of(this.n ** BigInt(e), this.d ** BigInt(e));
    if (this.n === 0n) throw new RangeError('Q: 0^negative');
    return Q.of(this.d ** BigInt(-e), this.n ** BigInt(-e));
  }
  floor(): bigint {
    let q = this.n / this.d;
    if (this.n < 0n && q * this.d !== this.n) q -= 1n;
    return q;
  }
  /** this mod m (result in [0, m)) for rational m > 0 */
  mod(m: Q): Q {
    const k = this.div(m).floor();
    return this.sub(m.mul(Q.of(k)));
  }

  toDecimal(): Dec {
    if (this.d === 1n) return new D(this.n.toString());
    return new D(this.n.toString()).div(new D(this.d.toString()));
  }
  toNumber(): number {
    return this.toDecimal().toNumber();
  }
  /** |value| magnitude check helper: true when |this| >= 10^k (k>=0), without Decimal for small sizes */
  absGE10Pow(k: number): boolean {
    return babs(this.n) >= 10n ** BigInt(k) * this.d;
  }
  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }
}
