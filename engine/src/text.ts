// Text -> editor items. A convenience DSL used by tests and for loading saved history.
//   structure keywords:  frac(a,b)  mix(w,n,d)  sqrt(a)  cbrt(a)  root(n,a)  abs(a)  logb(b)  pow(e)
//                        sum(lo,hi,body)  int(lo,hi,body)  deriv(body,at)
//   everything else maps one-to-one onto key lexemes.

import { FN_LEXEMES } from './parser';
import type { Item, Slot } from './items';

const FNS = Object.keys(FN_LEXEMES).sort((a, b) => b.length - a.length);
const WORDS = ['PreAns', 'Ans', 'Ran#', 'nPr', 'nCr', 'xnor', 'xor', 'and', 'or', '÷R'];
const STRUCTS: Record<string, string[]> = {
  frac: ['n', 'd'],
  mix: ['w', 'n', 'd'],
  sqrt: ['a'],
  cbrt: ['a'],
  root: ['n', 'a'],
  abs: ['a'],
  logb: ['b'],
  pow: ['e'],
  sum: ['lo', 'hi', 'body'],
  int: ['lo', 'hi', 'body'],
  deriv: ['body', 'at'],
};

/** split "a,b,c" at top-level commas */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length; // unclosed: take the rest
}

export function fromText(src: string): Slot {
  const out: Item[] = [];
  let i = 0;
  const s = src;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') {
      i++;
      continue;
    }
    // structures
    let matched = false;
    for (const name of Object.keys(STRUCTS)) {
      if (s.startsWith(name + '(', i)) {
        const open = i + name.length;
        const close = matchParen(s, open);
        const args = splitArgs(s.slice(open + 1, close));
        const slots = STRUCTS[name].map((_, k) => fromText(args[k] ?? ''));
        const names = STRUCTS[name];
        const obj: Record<string, unknown> = {};
        names.forEach((nm, k) => (obj[nm] = slots[k]));
        const kind = name === 'sum' ? 'sigma' : name === 'int' ? 'integ' : name;
        out.push({ k: kind, ...obj } as unknown as Item);
        i = close + 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // function lexemes
    const fn = FNS.find((f) => s.startsWith(f, i));
    if (fn) {
      out.push({ k: 'c', s: fn });
      i += fn.length;
      continue;
    }
    const w = WORDS.find((x) => s.startsWith(x, i));
    if (w) {
      out.push({ k: 'c', s: w });
      i += w.length;
      continue;
    }
    if (s.startsWith('pi', i)) {
      out.push({ k: 'c', s: 'π' });
      i += 2;
      continue;
    }
    // ×10^x written as E: after a digit, "E" + optional sign + digits
    if (c === 'E' && i > 0 && /[\d.]/.test(s[i - 1])) {
      let j = i + 1;
      let e = '';
      if (s[j] === '-' || s[j] === '+') e += s[j++] === '-' ? '-' : '';
      while (j < s.length && /\d/.test(s[j])) e += s[j++];
      out.push({ k: 'e10', e: e.split('').map((x) => ({ k: 'c', s: x }) as Item) });
      i = j;
      continue;
    }
    out.push({ k: 'c', s: c });
    i++;
  }
  return out;
}
