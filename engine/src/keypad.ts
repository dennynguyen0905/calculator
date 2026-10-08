// Keypad definition: layout, legends (primary / SHIFT / ALPHA) and the command each combination produces.
// Commands are plain strings interpreted by Calculator.exec().

export type KeyStyle = 'shift' | 'alpha' | 'fn' | 'menu' | 'on' | 'num' | 'op' | 'edit' | 'pad' | 'eq';

export interface KeyDef {
  id: string;
  /** primary legend as printed on the key */
  label: string;
  /** yellow legend above the key */
  shift?: string;
  /** red legend above the key */
  alpha?: string;
  style: KeyStyle;
  /** commands for [plain, SHIFT, ALPHA] */
  cmd: [string, string?, string?];
}

const k = (id: string, label: string, style: KeyStyle, cmd: [string, string?, string?], shift?: string, alpha?: string): KeyDef => ({
  id,
  label,
  style,
  cmd,
  shift,
  alpha,
});

/** Top block: 6 columns. Row 0/1 columns 2-3 are occupied by the REPLAY pad (see PAD). */
export const TOP_ROWS: (KeyDef | null)[][] = [
  [k('shift', 'SHIFT', 'shift', ['shift']), k('alpha', 'ALPHA', 'alpha', ['alpha']), null, null, k('mode', 'MODE', 'menu', ['mode', 'setup'], 'SETUP'), k('on', 'ON', 'on', ['on'])],
  [k('calc', 'CALC', 'fn', ['calc', 'solve', 'equal'], 'SOLVE', '='), k('integ', '∫▫dx', 'fn', ['integ', 'deriv', 'colon'], 'd/dx', ':'), null, null, k('inv', 'x⁻¹', 'fn', ['inv', 'fact'], 'x!'), k('sigma', 'Σ▫', 'fn', ['sigma', 'rnd'], 'Rnd')],
  [
    k('frac', '▫/▫', 'fn', ['frac', 'mixed'], 'a b/c'),
    k('sqrt', '√▫', 'fn', ['sqrt', 'cbrt'], '³√▫'),
    k('sq', 'x²', 'fn', ['sq', 'cube'], 'x³'),
    k('pow', 'x^▫', 'fn', ['pow', 'root'], 'ʸ√▫'),
    k('log', 'log', 'fn', ['log', 'pow10', 'logb'], '10^▫', 'log▫'),
    k('ln', 'ln', 'fn', ['ln', 'powe'], 'e^▫'),
  ],
  [
    k('neg', '(−)', 'fn', ['neg', 'angle', 'A'], '∠', 'A'),
    k('dms', '°′″', 'fn', ['dms', 'factcmd', 'B'], 'FACT', 'B'),
    k('hyp', 'hyp', 'fn', ['hyp', undefined, 'C'], undefined, 'C'),
    k('sin', 'sin', 'fn', ['sin', 'asin', 'D'], 'sin⁻¹', 'D'),
    k('cos', 'cos', 'fn', ['cos', 'acos', 'E'], 'cos⁻¹', 'E'),
    k('tan', 'tan', 'fn', ['tan', 'atan', 'F'], 'tan⁻¹', 'F'),
  ],
  [
    k('rcl', 'RCL', 'fn', ['rcl', 'sto'], 'STO'),
    k('eng', 'ENG', 'fn', ['eng', 'engl', 'i'], '←', 'i'),
    k('lpar', '(', 'fn', ['(', 'abs', '%'], 'Abs', '%'),
    k('rpar', ')', 'fn', [')', ',', 'X'], ',', 'X'),
    k('sd', 'S⇔D', 'fn', ['sd', undefined, 'Y'], undefined, 'Y'),
    k('mplus', 'M+', 'fn', ['mplus', 'mminus', 'M'], 'M−', 'M'),
  ],
];

/** Bottom block: 5 columns. */
export const BOTTOM_ROWS: KeyDef[][] = [
  [
    k('7', '7', 'num', ['7', 'const'], 'CONST'),
    k('8', '8', 'num', ['8', 'conv'], 'CONV'),
    k('9', '9', 'num', ['9', 'clr'], 'CLR'),
    k('del', 'DEL', 'edit', ['del', 'ins'], 'INS'),
    k('ac', 'AC', 'edit', ['ac', 'off'], 'OFF'),
  ],
  [
    k('4', '4', 'num', ['4', 'matrix'], 'MATRIX'),
    k('5', '5', 'num', ['5', 'vector'], 'VECTOR'),
    k('6', '6', 'num', ['6', 'optn'], 'OPTN'),
    k('mul', '×', 'op', ['×', 'nPr'], 'nPr'),
    k('div', '÷', 'op', ['÷', 'nCr', 'divr'], 'nCr', '÷R'),
  ],
  [
    k('1', '1', 'num', ['1', 'stat'], 'STAT'),
    k('2', '2', 'num', ['2', 'cmplx'], 'CMPLX'),
    k('3', '3', 'num', ['3', 'base'], 'BASE'),
    k('add', '+', 'op', ['+', 'pol'], 'Pol('),
    k('sub', '−', 'op', ['-', 'rec'], 'Rec('),
  ],
  [
    k('0', '0', 'num', ['0', 'ranint'], 'RanInt#'),
    k('dot', '.', 'num', ['.', 'ranhash'], 'Ran#'),
    k('exp', '×10ˣ', 'num', ['exp10', 'pi', 'e'], 'π', 'e'),
    k('ans', 'Ans', 'num', ['Ans', 'drg', 'PreAns'], 'DRG▶', 'PreAns'),
    k('eq', '=', 'eq', ['eq']),
  ],
];

/** REPLAY pad keys */
export const PAD_KEYS = ['left', 'up', 'down', 'right'] as const;

export const ALL_KEYS: KeyDef[] = [...TOP_ROWS.flat().filter((x): x is KeyDef => !!x), ...BOTTOM_ROWS.flat()];

const BY_ID = new Map<string, KeyDef>(ALL_KEYS.map((d) => [d.id, d]));

export function keyDef(id: string): KeyDef | undefined {
  return BY_ID.get(id);
}

/** Resolve a physical key + modifier state into a command. */
export function resolveKey(id: string, shift: boolean, alpha: boolean): string | null {
  if ((PAD_KEYS as readonly string[]).includes(id)) return id;
  if (id === 'replay') return 'replay';
  const d = BY_ID.get(id);
  if (!d) return null;
  if (shift) return d.cmd[1] ?? null;
  if (alpha) return d.cmd[2] ?? d.cmd[0];
  return d.cmd[0];
}
