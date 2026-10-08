import Decimal from 'decimal.js';

/** Decimal constructor with 60 internal digits (spec: >= 30). */
export const D = Decimal.clone({
  precision: 60,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -1000,
  toExpPos: 1000,
  minE: -100000,
  maxE: 100000,
});
export type Dec = InstanceType<typeof D>;

/** Round to the 15 significant digits that the device stores internally. */
export function round15(x: Dec): Dec {
  if (x.isZero() || !x.isFinite()) return x;
  return x.toSignificantDigits(15, Decimal.ROUND_HALF_UP);
}
