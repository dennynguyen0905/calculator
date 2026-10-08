// BigInt helpers: gcd, integer roots, factorisation.

export const babs = (a: bigint): bigint => (a < 0n ? -a : a);

export function gcd(a: bigint, b: bigint): bigint {
  a = babs(a);
  b = babs(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return babs(a / gcd(a, b) * b);
}

export function bitLength(n: bigint): number {
  n = babs(n);
  if (n === 0n) return 0;
  const hex = n.toString(16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0], 16)));
}

/** floor(sqrt(n)) for n >= 0 */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError('isqrt of negative');
  if (n < 2n) return n;
  // initial guess from bit length
  let x = 1n << BigInt((bitLength(n) + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** floor(n^(1/k)) for n >= 0, k >= 1 */
export function iroot(n: bigint, k: number): bigint {
  if (n < 0n) throw new RangeError('iroot of negative');
  if (k === 1 || n < 2n) return n;
  if (k === 2) return isqrt(n);
  const K = BigInt(k);
  let x = 1n << BigInt(Math.ceil(bitLength(n) / k));
  for (;;) {
    const y = ((K - 1n) * x + n / x ** (K - 1n)) / K;
    if (y >= x) return x;
    x = y;
  }
}

export function ipow(b: bigint, e: number): bigint {
  return b ** BigInt(e);
}

let smallPrimesCache: number[] | null = null;
export function smallPrimes(limit = 10000): number[] {
  if (smallPrimesCache && limit <= 10000) return smallPrimesCache;
  const sieve = new Uint8Array(limit + 1);
  const out: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (!sieve[i]) {
      out.push(i);
      for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
    }
  }
  if (limit === 10000) smallPrimesCache = out;
  return out;
}

/**
 * Split n (> 0) as s^2 * r with r square-free (best effort: primes up to 10^4 are
 * stripped by trial division, the cofactor is then tested for being a perfect square).
 */
export function squareFreeSplit(n: bigint): { s: bigint; r: bigint } {
  if (n <= 0n) throw new RangeError('squareFreeSplit needs n > 0');
  if (n === 1n) return { s: 1n, r: 1n };
  let s = 1n;
  let r = 1n; // square-free accumulator
  let rest = n;
  for (const p of smallPrimes()) {
    const bp = BigInt(p);
    if (bp * bp > rest) break;
    if (rest % bp === 0n) {
      let e = 0;
      while (rest % bp === 0n) {
        rest /= bp;
        e++;
      }
      if (e >> 1) s *= bp ** BigInt(e >> 1);
      if (e & 1) r *= bp;
    }
  }
  if (rest > 1n) {
    const q = isqrt(rest);
    if (q * q === rest) s *= q;
    else r *= rest;
  }
  return { s, r };
}

/** Prime factorisation by trial division (fine up to ~1e12). Returns [prime, exponent][] */
export function factorize(n: bigint): [bigint, number][] {
  if (n < 2n) return [];
  const out: [bigint, number][] = [];
  let rest = n;
  for (const p of smallPrimes()) {
    const bp = BigInt(p);
    if (bp * bp > rest) break;
    if (rest % bp === 0n) {
      let e = 0;
      while (rest % bp === 0n) {
        rest /= bp;
        e++;
      }
      out.push([bp, e]);
    }
  }
  if (rest > 1n) {
    // continue with wheel for larger primes if rest is still big
    if (rest > 100_000_000n) {
      let d = 10001n;
      while (d * d <= rest) {
        if (rest % d === 0n) {
          let e = 0;
          while (rest % d === 0n) {
            rest /= d;
            e++;
          }
          out.push([d, e]);
        }
        d += 2n;
        if (d > 3_000_000n) break; // safety cap
      }
    }
    if (rest > 1n) out.push([rest, 1]);
  }
  return out;
}
