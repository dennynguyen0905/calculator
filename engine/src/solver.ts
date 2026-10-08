// Numeric root finding for SOLVE: Newton/secant from the user's initial value, with a bracketing fallback.

type Fn = (x: number) => number;

const finite = (v: number): boolean => Number.isFinite(v);

function newton(f: Fn, x0: number): number | null {
  let x = x0;
  for (let it = 0; it < 120; it++) {
    const fx = f(x);
    if (!finite(fx)) return null;
    if (fx === 0) return x;
    const h = Math.max(Math.abs(x), 1) * 1e-7;
    const d = (f(x + h) - f(x - h)) / (2 * h);
    if (!finite(d) || d === 0) return null;
    let step = fx / d;
    // damped step to avoid wild jumps
    let x1 = x - step;
    let tries = 0;
    while (tries < 30 && (!finite(f(x1)) || Math.abs(f(x1)) > Math.abs(fx) * 4)) {
      step /= 2;
      x1 = x - step;
      tries++;
    }
    if (Math.abs(x1 - x) <= 1e-15 * Math.max(Math.abs(x1), 1e-300)) return x1;
    x = x1;
  }
  return Math.abs(f(x)) < 1e-9 ? x : null;
}

function bisect(f: Fn, lo: number, hi: number): number {
  let flo = f(lo);
  for (let i = 0; i < 300; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (fm === 0 || mid === lo || mid === hi) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function bracketSearch(f: Fn, x0: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let scale = 1e-3; scale <= 1e12; scale *= 4) {
    const n = 40;
    const a = x0 - scale;
    const b = x0 + scale;
    let prevX = a;
    let prevF = f(a);
    for (let i = 1; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const fx = f(x);
      if (finite(prevF) && finite(fx) && (prevF === 0 || Math.sign(prevF) !== Math.sign(fx))) {
        const root = bisect(f, prevX, x);
        // reject poles (sign change through infinity)
        if (Math.abs(f(root)) < 1e-6 * Math.max(1, Math.abs(prevF), Math.abs(fx))) {
          const dist = Math.abs(root - x0);
          if (dist < bestDist) {
            best = root;
            bestDist = dist;
          }
        }
      }
      prevX = x;
      prevF = fx;
    }
    if (best !== null) return best;
  }
  return best;
}

function snap(f: Fn, x: number): number {
  let best = x;
  let bestF = Math.abs(f(x));
  for (let digits = 8; digits <= 14; digits++) {
    const s = Number(x.toPrecision(digits));
    const fs = Math.abs(f(s));
    if (fs < bestF || (fs === bestF && digits < 14)) {
      best = s;
      bestF = fs;
      if (fs === 0) break;
    }
  }
  return best;
}

/** Find a root of f near x0, or null when none is found. */
export function solveRoot(f: Fn, x0: number): number | null {
  let r = newton(f, x0);
  if (r === null || !finite(r)) r = bracketSearch(f, x0);
  if (r === null) return null;
  return snap(f, r);
}
