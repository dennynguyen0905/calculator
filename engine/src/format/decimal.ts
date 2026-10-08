// Decimal number formatting: Norm 1/2, Fix, Sci and Engineering notation, 10 significant digits.

import { D, type Dec } from '../dec';
import type { NumFmt } from '../settings';
import { row, sup, text, type RNode } from './rnode';

export interface FmtOpts {
  fmt: NumFmt;
  /** ENG key presses: >0 steps the exponent up by 3 each time, <0 steps down (ENG←); 0 = off */
  engStep?: number;
  engSymbol?: boolean;
  mark?: '.' | ',';
  sep?: boolean;
}

export const ENG_SYMBOLS: Record<number, string> = {
  [-15]: 'f',
  [-12]: 'p',
  [-9]: 'n',
  [-6]: 'μ',
  [-3]: 'm',
  0: '',
  3: 'k',
  6: 'M',
  9: 'G',
  12: 'T',
  15: 'P',
  18: 'E',
};

interface Parts {
  neg: boolean;
  /** digits before/after the point, or mantissa for scientific */
  text: string;
  exp: number | null;
  sym?: string;
}

function group3(intPart: string, sepChar: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sepChar);
}

function decorate(numText: string, o: FmtOpts): string {
  const [ip0, fp] = numText.split('.');
  const ip = o.sep ? group3(ip0, o.mark === ',' ? '.' : ',') : ip0;
  const mark = o.mark ?? '.';
  return fp !== undefined ? `${ip}${mark}${fp}` : ip;
}

/** mantissa string "d.ddd" and exponent from a (<= digits) significant-digit decimal */
function sciOf(r: Dec, digits: number | null): { mant: string; exp: number } {
  const s = digits === null ? r.toExponential() : r.toExponential(digits - 1);
  const [m, e] = s.split('e');
  return { mant: m, exp: Number(e) };
}

/** mantissa digits for display at exponent `target` given sig digits `digits` (no point) of value d.ddd×10^exp */
function engMantissa(digits: string, exp: number, target: number): string {
  const shift = exp - target;
  if (shift >= 0) {
    const padded = digits.padEnd(shift + 1, '0');
    const left = padded.slice(0, shift + 1);
    const right = padded.slice(shift + 1).replace(/0+$/, '');
    return right ? `${left}.${right}` : left;
  }
  const right = ('0'.repeat(-shift - 1) + digits).replace(/0+$/, '');
  return `0.${right}`;
}

export function decimalParts(x: Dec, o: FmtOpts): Parts {
  const neg = x.isNeg() && !x.isZero();
  const ax = x.abs();
  const { kind, n } = o.fmt;
  const step = o.engStep ?? 0;
  const finish = (mant: string, exp: number, plain = false): Parts => {
    if (step !== 0) {
      const digits = mant.replace('.', '');
      const base = Math.floor(exp / 3) * 3;
      const target = step > 0 ? base + 3 * (step - 1) : (plain ? 0 : base) + 3 * step;
      const m = engMantissa(digits, exp, target);
      if (o.engSymbol && ENG_SYMBOLS[target] !== undefined) return { neg, text: decorate(m, o), exp: null, sym: ENG_SYMBOLS[target] };
      return { neg, text: decorate(m, o), exp: target };
    }
    return { neg, text: decorate(mant, o), exp };
  };

  if (kind === 'fix') {
    const r = ax.toDecimalPlaces(n, D.ROUND_HALF_UP);
    if (r.isZero()) return { neg: false, text: decorate((0).toFixed(n), o), exp: null };
    if (r.e >= 10 || step !== 0) {
      const { mant, exp } = sciOf(ax.toSignificantDigits(10, D.ROUND_HALF_UP), null);
      return finish(mant, exp, r.e < 10);
    }
    return { neg, text: decorate(r.toFixed(n), o), exp: null };
  }
  if (ax.isZero()) return { neg: false, text: '0', exp: null };
  if (kind === 'sci') {
    const digits = n === 0 ? 10 : n;
    const r = ax.toSignificantDigits(digits, D.ROUND_HALF_UP);
    const { mant, exp } = sciOf(r, digits);
    return finish(mant, exp, false);
  }
  // norm 1 / norm 2
  const r = ax.toSignificantDigits(10, D.ROUND_HALF_UP);
  const e = r.e;
  const lo = kind === 'norm1' ? -2 : -9;
  const plainRange = e >= lo && e <= 9;
  if (plainRange && step === 0) {
    return { neg, text: decorate(r.toFixed(), o), exp: null };
  }
  const { mant, exp } = sciOf(r, null);
  return finish(mant, exp, plainRange);
}

export function decimalNode(x: Dec, o: FmtOpts): RNode {
  const p = decimalParts(x, o);
  const sign = p.neg ? '-' : '';
  if (p.exp === null) return text(`${sign}${p.text}${p.sym ?? ''}`);
  return row(text(`${sign}${p.text}×10`), sup(text(String(p.exp))));
}

export function decimalString(x: Dec, o: FmtOpts): string {
  const p = decimalParts(x, o);
  const sign = p.neg ? '-' : '';
  if (p.exp === null) return `${sign}${p.text}${p.sym ?? ''}`;
  return `${sign}${p.text}×10^${p.exp}`;
}
