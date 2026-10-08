// View model handed to the UI after every key press.

import type { RNode } from './format/rnode';

export interface Status {
  shift: boolean;
  alpha: boolean;
  hyp: boolean;
  /** D / R / G */
  angle: 'D' | 'R' | 'G';
  fix: boolean;
  sci: boolean;
  eng: boolean;
  /** Math input/output indicator */
  math: boolean;
  sto: boolean;
  rcl: boolean;
  /** variable M holds a non-zero value */
  m: boolean;
  /** short mode name, e.g. "COMP" */
  mode: string;
  /** scroll indicators */
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** overwrite (insert off) */
  overwrite: boolean;
  /** "Disp" indicator for multi-part results */
  disp: boolean;
  complex: boolean;
}

export type Row =
  | { t: 'expr'; node: RNode }
  | { t: 'result'; nodes: RNode[]; dim?: boolean }
  | { t: 'line'; text: string; align?: 'left' | 'right' | 'center'; inv?: boolean; dim?: boolean; title?: boolean }
  | { t: 'node'; node: RNode; align?: 'left' | 'right' | 'center'; inv?: boolean }
  | { t: 'cells'; cells: { text: string; inv?: boolean; cursor?: boolean; node?: RNode; w?: number }[] };

export interface Screen {
  on: boolean;
  status: Status;
  title?: string;
  rows: Row[];
  /** the row index showing the editing cursor (so the UI can scroll to keep it visible) */
  cursorRow?: number;
}

export const emptyStatus = (): Status => ({
  shift: false,
  alpha: false,
  hyp: false,
  angle: 'D',
  fix: false,
  sci: false,
  eng: false,
  math: true,
  sto: false,
  rcl: false,
  m: false,
  mode: 'COMP',
  up: false,
  down: false,
  left: false,
  right: false,
  overwrite: false,
  disp: false,
  complex: false,
});
