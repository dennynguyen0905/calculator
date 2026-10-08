// Commands that edit an expression (digits, operators, functions, templates). Shared by the main pad and cell editors.

import { constId } from './constants';
import {
  currentSlot,
  insertChar,
  insertFixedPow,
  insertItem,
  insertStruct,
  type Editor,
} from './editor/editor';
import type { Item } from './items';

const SIMPLE: Record<string, string> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '.': '.',
  '+': '+',
  '-': '-',
  '×': '×',
  '÷': '÷',
  '(': '(',
  ')': ')',
  ',': ',',
  neg: '-',
  '%': '%',
  fact: '!',
  nPr: 'nPr',
  nCr: 'nCr',
  angle: '∠',
  divr: '÷R',
  pi: 'π',
  e: 'e',
  i: 'i',
  Ans: 'Ans',
  PreAns: 'PreAns',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F',
  X: 'X',
  Y: 'Y',
  M: 'M',
  pol: 'Pol(',
  rec: 'Rec(',
  ranhash: 'Ran#',
  ranint: 'RanInt#(',
  rnd: 'Rnd(',
  log: 'log(',
  ln: 'ln(',
  colon: ':',
  equal: '=', // ALPHA+CALC
  dot: '.',
  gcd: 'GCD(',
  lcm: 'LCM(',
  intfn: 'Int(',
  intg: 'Intg(',
  rem: 'Rem(',
  quotient: 'Quotient(',
  conjg: 'Conjg(',
  arg: 'Arg(',
  reP: 'ReP(',
  imP: 'ImP(',
};

const HYP: Record<string, string> = {
  sin: 'sinh(',
  cos: 'cosh(',
  tan: 'tanh(',
  asin: 'sinh⁻¹(',
  acos: 'cosh⁻¹(',
  atan: 'tanh⁻¹(',
};
const TRIG: Record<string, string> = {
  sin: 'sin(',
  cos: 'cos(',
  tan: 'tan(',
  asin: 'sin⁻¹(',
  acos: 'cos⁻¹(',
  atan: 'tan⁻¹(',
};

/** commands that take Ans as left operand when typed right after a result */
export const ANS_OPS = new Set(['+', '-', '×', '÷', 'pow', 'sq', 'cube', 'inv', 'fact', '%', 'nPr', 'nCr', 'angle', 'divr', 'dms']);

export function isInsertCmd(cmd: string): boolean {
  if (cmd in SIMPLE || cmd in TRIG) return true;
  return STRUCT_CMDS.has(cmd) || cmd.startsWith('tok:') || cmd.startsWith('const:') || cmd.startsWith('seq:');
}

const STRUCT_CMDS = new Set([
  'frac',
  'mixed',
  'sqrt',
  'cbrt',
  'root',
  'abs',
  'pow',
  'sq',
  'cube',
  'inv',
  'pow10',
  'powe',
  'logb',
  'exp10',
  'integ',
  'deriv',
  'sigma',
  'dms',
]);

function insertSeq(e: Editor, s: string): void {
  for (const ch of s) insertChar(e, ch);
}

/** next DMS symbol to insert, based on the symbols already typed in the current number run */
function nextDms(e: Editor): string {
  const slot = currentSlot(e);
  for (let j = e.cur.idx - 1; j >= 0; j--) {
    const it = slot[j];
    if (it.k !== 'c') break;
    if (it.s === '″') return '°';
    if (it.s === '′') return '″';
    if (it.s === '°') return '′';
    if (!/^[0-9.]$/.test(it.s)) break;
  }
  return '°';
}

/**
 * Apply an editing command to the editor.
 * Returns true if the command was an editing command.
 */
export function applyInsert(e: Editor, cmd: string, hyp = false, line = false): boolean {
  if (hyp && cmd in HYP) {
    insertChar(e, HYP[cmd]);
    return true;
  }
  if (cmd in TRIG) {
    insertChar(e, TRIG[cmd]);
    return true;
  }
  if (cmd.startsWith('tok:')) {
    insertChar(e, cmd.slice(4));
    return true;
  }
  if (cmd.startsWith('seq:')) {
    for (const t of cmd.slice(4).split('|')) insertChar(e, t);
    return true;
  }
  if (cmd.startsWith('const:')) {
    insertChar(e, constId(Number(cmd.slice(6))));
    return true;
  }
  switch (cmd) {
    case 'frac':
      if (line) insertChar(e, '⌟');
      else insertStruct(e, 'frac', { capture: 'n' });
      return true;
    case 'mixed':
      if (line) insertChar(e, '⌟');
      else insertStruct(e, 'mix', { capture: 'w' });
      return true;
    case 'sqrt':
      if (line) insertChar(e, '√(');
      else insertStruct(e, 'sqrt');
      return true;
    case 'cbrt':
      if (line) insertChar(e, '³√(');
      else insertStruct(e, 'cbrt');
      return true;
    case 'root':
      if (line) insertChar(e, 'ʸ√');
      else insertStruct(e, 'root');
      return true;
    case 'abs':
      if (line) insertChar(e, 'Abs(');
      else insertStruct(e, 'abs');
      return true;
    case 'pow':
      if (line) insertSeq(e, '^(');
      else insertStruct(e, 'pow');
      return true;
    case 'sq':
      if (line) insertChar(e, '²');
      else insertFixedPow(e, '2');
      return true;
    case 'cube':
      if (line) insertChar(e, '³');
      else insertFixedPow(e, '3');
      return true;
    case 'inv':
      if (line) insertChar(e, '⁻¹');
      else insertFixedPow(e, '-1');
      return true;
    case 'pow10':
      insertSeq(e, '10');
      if (line) insertSeq(e, '^(');
      else insertStruct(e, 'pow');
      return true;
    case 'powe':
      insertChar(e, 'e');
      if (line) insertSeq(e, '^(');
      else insertStruct(e, 'pow');
      return true;
    case 'logb':
      if (line) {
        insertChar(e, 'logb(');
      } else {
        insertStruct(e, 'logb');
        // the "(" belongs to the template, placed right after it in the parent slot
        const step = e.cur.path[e.cur.path.length - 1];
        const parentCur = { ...e, cur: { path: e.cur.path.slice(0, -1), idx: step.idx + 1 } };
        insertItem(parentCur, { k: 'c', s: '(' } as Item);
      }
      return true;
    case 'exp10':
      if (line) insertChar(e, '×10^(');
      else insertStruct(e, 'e10');
      return true;
    case 'integ':
      insertStruct(e, 'integ');
      return true;
    case 'deriv':
      insertStruct(e, 'deriv');
      return true;
    case 'sigma':
      insertStruct(e, 'sigma');
      return true;
    case 'dms':
      insertChar(e, nextDms(e));
      return true;
    default:
      if (cmd in SIMPLE) {
        insertChar(e, SIMPLE[cmd]);
        return true;
      }
      return false;
  }
}
