// Editor items: the structured (2D) representation of what the user typed.

export type Slot = Item[];

export type Item =
  | { k: 'c'; s: string } // one key's worth of text: a digit, operator, "sin(", "π", "A", ...
  | { k: 'frac'; n: Slot; d: Slot }
  | { k: 'mix'; w: Slot; n: Slot; d: Slot }
  | { k: 'sqrt'; a: Slot }
  | { k: 'cbrt'; a: Slot }
  | { k: 'root'; n: Slot; a: Slot } // n-th root: index n, radicand a
  | { k: 'pow'; e: Slot; fixed?: boolean }
  | { k: 'e10'; e: Slot } // ×10^e
  | { k: 'logb'; b: Slot } // log base b, followed by a "(" char item
  | { k: 'abs'; a: Slot }
  | { k: 'sigma'; lo: Slot; hi: Slot; body: Slot }
  | { k: 'integ'; lo: Slot; hi: Slot; body: Slot }
  | { k: 'deriv'; body: Slot; at: Slot };

export type ItemKind = Item['k'];

/** names of the slots of each structured item, in cursor traversal order */
export const SLOT_NAMES: Record<Exclude<ItemKind, 'c'>, string[]> = {
  frac: ['n', 'd'],
  mix: ['w', 'n', 'd'],
  sqrt: ['a'],
  cbrt: ['a'],
  root: ['n', 'a'],
  pow: ['e'],
  e10: ['e'],
  logb: ['b'],
  abs: ['a'],
  sigma: ['body', 'lo', 'hi'],
  integ: ['body', 'lo', 'hi'],
  deriv: ['body', 'at'],
};

export const ch = (s: string): Item => ({ k: 'c', s });

export function cloneItem(it: Item): Item {
  return JSON.parse(JSON.stringify(it)) as Item;
}
