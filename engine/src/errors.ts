export type ErrorKind = 'Math' | 'Syntax' | 'Stack' | 'Argument' | 'Dimension' | 'Variable' | 'Range' | 'Time Out' | 'Can\'t Solve' | 'Circular';

/** Errors shown by the calculator ("Math ERROR", "Syntax ERROR", ...). */
export class CalcError extends Error {
  readonly kind: ErrorKind;
  /** index of the offending top-level editor item, used by ◀/▶ "Goto" after an error */
  pos?: number;
  constructor(kind: ErrorKind, pos?: number) {
    super(kind === "Can't Solve" || kind === 'Time Out' ? kind : `${kind} ERROR`);
    this.kind = kind;
    this.pos = pos;
  }
}

export const mathError = () => new CalcError('Math');
export const syntaxError = (pos?: number) => new CalcError('Syntax', pos);
export const stackError = () => new CalcError('Stack');
export const argError = () => new CalcError('Argument');
