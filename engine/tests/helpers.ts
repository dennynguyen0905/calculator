import { calc, newMachine, type Machine } from '../src/calc';
import type { Setup } from '../src/settings';

export interface Opt {
  angle?: Setup['angle'];
  io?: Setup['io'];
  frac?: Setup['frac'];
  fmt?: Setup['numFmt'];
  complex?: boolean;
  toggled?: boolean;
  polar?: boolean;
  vars?: Record<string, number>;
}

export function machine(o: Opt = {}): Machine {
  const m = newMachine(
    {
      ...(o.angle ? { angle: o.angle } : {}),
      ...(o.io ? { io: o.io } : {}),
      ...(o.frac ? { frac: o.frac } : {}),
      ...(o.fmt ? { numFmt: o.fmt } : {}),
      ...(o.polar ? { complexFmt: 'polar' as const } : {}),
    },
    !!o.complex,
  );
  return m;
}

/** run one expression on a fresh machine */
export function c(expr: string, o: Opt = {}): string {
  return calc(expr, machine(o), { toggled: o.toggled });
}

export type Case = [expr: string, expected: string];
export type OptCase = [expr: string, expected: string, opt: Opt];
