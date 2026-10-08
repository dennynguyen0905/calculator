// Convenience layer: evaluate text / items under a Setup and format the result.

import { CalcError } from './errors';
import { evalItems, makeCtx, type EvalCtx, type Val } from './evaluator';
import { splitStatements } from './pad';
import { formatPlain, roundForDisplay } from './format/value';
import type { Slot } from './items';
import { defaultSetup, type Setup } from './settings';
import { fromText } from './text';

export interface Machine {
  setup: Setup;
  ctx: EvalCtx;
}

export function newMachine(over: Partial<Setup> = {}, complex = false): Machine {
  const setup = { ...defaultSetup(), ...over };
  const ctx = makeCtx({ angle: setup.angle, complex });
  ctx.round = (n) => roundForDisplay(n, setup);
  return { setup, ctx };
}

/** Evaluate and store Ans like the real "=" key does. */
export function run(m: Machine, items: Slot): Val {
  m.ctx.angle = m.setup.angle;
  let v!: Val;
  for (const stmt of splitStatements(items)) {
    v = evalItems(stmt, m.ctx);
    m.ctx.preAns = m.ctx.ans;
    m.ctx.ans = v;
  }
  return v;
}

/** text in, plain-text display out ("Math ERROR" etc. on failure) */
export function calc(src: string, m: Machine = newMachine(), opts: { toggled?: boolean } = {}): string {
  try {
    const v = run(m, fromText(src));
    return formatPlain(v, m.setup, opts);
  } catch (e) {
    if (e instanceof CalcError) return e.message;
    throw e;
  }
}
