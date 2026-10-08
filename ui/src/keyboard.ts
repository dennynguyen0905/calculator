// Physical keyboard -> calculator key ids. A mapping may press several keys in sequence (e.g. SHIFT then a key).

export type KeySeq = string[];

const PLAIN: Record<string, KeySeq> = {
  '0': ['0'], '1': ['1'], '2': ['2'], '3': ['3'], '4': ['4'], '5': ['5'], '6': ['6'], '7': ['7'], '8': ['8'], '9': ['9'],
  '.': ['dot'], ',': ['shift', 'rpar'],
  '+': ['add'], '-': ['sub'], '*': ['mul'], '/': ['div'],
  Enter: ['eq'], '=': ['eq'],
  Backspace: ['del'], Delete: ['del'], Escape: ['ac'],
  ArrowLeft: ['left'], ArrowRight: ['right'], ArrowUp: ['up'], ArrowDown: ['down'],
  '(': ['lpar'], ')': ['rpar'],
  '^': ['pow'], '!': ['shift', 'inv'], '%': ['alpha', 'lpar'],
  F1: ['shift'], F2: ['alpha'], F3: ['mode'], F4: ['shift', 'mode'], F5: ['on'], F6: ['shift', 'ac'],
  Tab: ['sd'], Home: ['ans'],
  // letters
  s: ['sin'], c: ['cos'], t: ['tan'], S: ['shift', 'sin'], C: ['shift', 'cos'], T: ['shift', 'tan'],
  l: ['ln'], g: ['log'], r: ['sqrt'], R: ['shift', 'sqrt'], q: ['sq'], Q: ['shift', 'sq'], i: ['inv'],
  f: ['frac'], F: ['shift', 'frac'], p: ['shift', 'exp'], e: ['alpha', 'exp'], E: ['exp'],
  x: ['alpha', 'rpar'], y: ['alpha', 'sd'], m: ['mplus'], M: ['shift', 'mplus'], a: ['alpha'], h: ['shift'],
  A: ['alpha', 'neg'], B: ['alpha', 'dms'], D: ['alpha', 'sin'],
  n: ['neg'], d: ['dms'], v: ['calc'], V: ['shift', 'calc'], w: ['integ'], W: ['shift', 'integ'],
  u: ['sigma'], k: ['hyp'], o: ['rcl'], O: ['shift', 'rcl'], b: ['shift', 'sd'],
  '[': ['shift', 'sqrt'], ']': ['shift', 'pow'], '_': ['neg'], '&': ['shift', 'mul'], '|': ['shift', 'div'],
};

export function keySeqFor(e: KeyboardEvent): KeySeq | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return PLAIN[e.key] ?? null;
}

/** human readable table for the README / help overlay */
export const KEYBOARD_HELP: [string, string][] = [
  ['0-9 .', 'digits and decimal point'],
  ['+ - * /', 'add, subtract, multiply, divide'],
  ['Enter / =', '='],
  ['Backspace', 'DEL'],
  ['Esc', 'AC'],
  ['← → ↑ ↓', 'REPLAY pad'],
  ['( )', 'brackets'],
  ['^', 'x^□'],
  ['q / Q', 'x² / x³'],
  ['r / R', '√ / ³√'],
  ['f / F', 'fraction / mixed fraction'],
  ['s c t', 'sin cos tan  (shift+letter: inverse)'],
  ['l g', 'ln log'],
  ['p', 'π'],
  ['E', '×10ˣ'],
  ['e', 'e (Euler)'],
  ['x y m', 'variables X Y M'],
  ['A B D', 'variables A B D'],
  ['n', '(−)'],
  ['v / V', 'CALC / SOLVE'],
  ['w / W', '∫ / d/dx'],
  ['u', 'Σ'],
  ['Tab', 'S⇔D'],
  ['!', 'x!'],
  ['F1 F2', 'SHIFT / ALPHA'],
  ['F3 F4', 'MODE / SETUP'],
  ['F5 / F6', 'ON / OFF'],
];
