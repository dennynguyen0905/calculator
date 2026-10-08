import type { AngleUnit } from './mathfn';

export type NumFmtKind = 'norm1' | 'norm2' | 'fix' | 'sci';

export interface NumFmt {
  kind: NumFmtKind;
  /** Fix: decimal places 0-9; Sci: significant digits 1-10 (0 = 10) */
  n: number;
}

export interface Setup {
  io: 'math' | 'line';
  angle: AngleUnit;
  numFmt: NumFmt;
  engSymbol: boolean;
  frac: 'dc' | 'abc';
  complexFmt: 'rect' | 'polar';
  statFreq: boolean;
  tableFn: 'f' | 'fg';
  decimalMark: '.' | ',';
  digitSep: boolean;
}

export const defaultSetup = (): Setup => ({
  io: 'math',
  angle: 'deg',
  numFmt: { kind: 'norm1', n: 0 },
  engSymbol: false,
  frac: 'dc',
  complexFmt: 'rect',
  statFreq: false,
  tableFn: 'f',
  decimalMark: '.',
  digitSep: false,
});
