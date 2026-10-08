// Structured expression editor: a tree of Items with a cursor path, editing like the real Natural display.

import { SLOT_NAMES, type Item, type ItemKind, type Slot } from '../items';

export interface PathStep {
  /** index of the structured item inside its parent slot */
  idx: number;
  /** slot name inside that item (see SLOT_NAMES) */
  slot: string;
}

export interface Cursor {
  path: PathStep[];
  /** insertion index inside the current slot */
  idx: number;
}

export interface Editor {
  root: Slot;
  cur: Cursor;
  /** false = overwrite mode (SHIFT+DEL toggles) */
  insert: boolean;
}

type Structured = Exclude<Item, { k: 'c' }>;

export const newEditor = (root: Slot = []): Editor => ({ root, cur: { path: [], idx: root.length }, insert: true });

export function cloneEditor(e: Editor): Editor {
  return { root: JSON.parse(JSON.stringify(e.root)) as Slot, cur: { path: e.cur.path.map((p) => ({ ...p })), idx: e.cur.idx }, insert: e.insert };
}

// ---------------------------------------------------------------- slot access

const getSlot = (it: Structured, name: string): Slot => (it as unknown as Record<string, Slot>)[name];
const slotNames = (it: Structured): string[] => SLOT_NAMES[it.k as Exclude<ItemKind, 'c'>];

/** the slot the cursor is currently in */
export function currentSlot(e: Editor): Slot {
  let s = e.root;
  for (const p of e.cur.path) s = getSlot(s[p.idx] as Structured, p.slot);
  return s;
}

function slotAt(root: Slot, path: PathStep[]): Slot {
  let s = root;
  for (const p of path) s = getSlot(s[p.idx] as Structured, p.slot);
  return s;
}

const isStruct = (it: Item | undefined): it is Structured => !!it && it.k !== 'c';

/** true if the cursor is inside some structure whose kind satisfies pred */
export function insideKind(e: Editor, kind: ItemKind): boolean {
  const p = e.cur.path;
  let s = e.root;
  for (const step of p) {
    const it = s[step.idx];
    if (it.k === kind) return true;
    s = getSlot(it as Structured, step.slot);
  }
  return false;
}

// ---------------------------------------------------------------- empty structures

export function emptyStruct(kind: Exclude<ItemKind, 'c'>): Structured {
  const o: Record<string, unknown> = { k: kind };
  for (const n of SLOT_NAMES[kind]) o[n] = [];
  return o as unknown as Structured;
}

// ---------------------------------------------------------------- insertion

/** characters that may form the numerator captured by the fraction key */
const NUMERIC = /^[0-9.]$/;

/** insert a plain token (digit, operator, function lexeme ...) */
export function insertChar(e: Editor, s: string): void {
  const slot = currentSlot(e);
  const it: Item = { k: 'c', s };
  if (!e.insert && e.cur.idx < slot.length && slot[e.cur.idx].k === 'c') {
    slot[e.cur.idx] = it;
    e.cur.idx++;
    return;
  }
  slot.splice(e.cur.idx, 0, it);
  e.cur.idx++;
}

/** insert an existing item (already filled), cursor goes after it */
export function insertItem(e: Editor, it: Item): void {
  const slot = currentSlot(e);
  slot.splice(e.cur.idx, 0, it);
  e.cur.idx++;
}

/**
 * insert an empty structure and move the cursor into its first slot (or into `enterSlot`).
 * `capture`: move the numeric run left of the cursor into slot `captureInto`.
 */
export function insertStruct(e: Editor, kind: Exclude<ItemKind, 'c'>, opts: { capture?: string; enter?: string; fill?: Record<string, Item[]> } = {}): void {
  const slot = currentSlot(e);
  const st = emptyStruct(kind);
  if (opts.fill) for (const [k, v] of Object.entries(opts.fill)) (st as unknown as Record<string, Slot>)[k] = v;
  let at = e.cur.idx;
  let captured = false;
  if (opts.capture) {
    let j = at;
    while (j > 0) {
      const p = slot[j - 1];
      if (p.k === 'c' && NUMERIC.test(p.s)) j--;
      else break;
    }
    if (j < at) {
      const moved = slot.splice(j, at - j);
      (st as unknown as Record<string, Slot>)[opts.capture] = moved;
      at = j;
      captured = true;
    }
  }
  slot.splice(at, 0, st);
  const names = slotNames(st);
  let enter = opts.enter ?? names[0];
  if (captured && opts.capture && !opts.enter) {
    // numerator captured -> go to the next slot
    const k = names.indexOf(opts.capture);
    enter = names[Math.min(k + 1, names.length - 1)];
  }
  e.cur = { path: [...e.cur.path, { idx: at, slot: enter }], idx: 0 };
}

/** insert fixed pow item such as x² (cursor stays after it) */
export function insertFixedPow(e: Editor, exponent: string): void {
  const slot = currentSlot(e);
  const e2: Slot = [...exponent].map((c) => ({ k: 'c', s: c }) as Item);
  slot.splice(e.cur.idx, 0, { k: 'pow', e: e2, fixed: true });
  e.cur.idx++;
}

// ---------------------------------------------------------------- navigation

function exitSlot(e: Editor, after: boolean): void {
  const step = e.cur.path[e.cur.path.length - 1];
  const parentPath = e.cur.path.slice(0, -1);
  let idx = after ? step.idx + 1 : step.idx;
  if (after) {
    // leaving a log-base template lands inside its "(" like the real device
    const parent = slotAt(e.root, parentPath);
    const it = parent[step.idx];
    const next = parent[step.idx + 1];
    if (it && it.k === 'logb' && next && next.k === 'c' && next.s === '(') idx++;
  }
  e.cur = { path: parentPath, idx };
}

/** ▶ */
export function moveRight(e: Editor): boolean {
  const slot = currentSlot(e);
  if (e.cur.idx < slot.length) {
    const it = slot[e.cur.idx];
    if (isStruct(it) && !(it.k === 'pow' && it.fixed)) {
      e.cur = { path: [...e.cur.path, { idx: e.cur.idx, slot: slotNames(it)[0] }], idx: 0 };
    } else e.cur.idx++;
    return true;
  }
  if (e.cur.path.length === 0) return false;
  const step = e.cur.path[e.cur.path.length - 1];
  const parent = slotAt(e.root, e.cur.path.slice(0, -1))[step.idx] as Structured;
  const names = slotNames(parent);
  const k = names.indexOf(step.slot);
  if (k < names.length - 1) {
    e.cur = { path: [...e.cur.path.slice(0, -1), { idx: step.idx, slot: names[k + 1] }], idx: 0 };
  } else exitSlot(e, true);
  return true;
}

/** ◀ */
export function moveLeft(e: Editor): boolean {
  if (e.cur.idx > 0) {
    const slot = currentSlot(e);
    // step over the "(" that belongs to a log-base template
    const before = slot[e.cur.idx - 1];
    if (before && before.k === 'c' && before.s === '(' && slot[e.cur.idx - 2]?.k === 'logb') e.cur.idx--;
    const it = slot[e.cur.idx - 1];
    if (isStruct(it) && !(it.k === 'pow' && it.fixed)) {
      const names = slotNames(it);
      const last = names[names.length - 1];
      const inner = getSlot(it, last);
      e.cur = { path: [...e.cur.path, { idx: e.cur.idx - 1, slot: last }], idx: inner.length };
    } else e.cur.idx--;
    return true;
  }
  if (e.cur.path.length === 0) return false;
  const step = e.cur.path[e.cur.path.length - 1];
  const parent = slotAt(e.root, e.cur.path.slice(0, -1))[step.idx] as Structured;
  const names = slotNames(parent);
  const k = names.indexOf(step.slot);
  if (k > 0) {
    const prev = names[k - 1];
    e.cur = { path: [...e.cur.path.slice(0, -1), { idx: step.idx, slot: prev }], idx: getSlot(parent, prev).length };
  } else exitSlot(e, false);
  return true;
}

/** ▼ : numerator -> denominator, base-line -> subscript style slots; returns false when nothing to do */
export function moveDown(e: Editor): boolean {
  const step = e.cur.path[e.cur.path.length - 1];
  if (!step) return false;
  const parent = slotAt(e.root, e.cur.path.slice(0, -1))[step.idx] as Structured;
  const names = slotNames(parent);
  const k = names.indexOf(step.slot);
  const vertical = parent.k === 'frac' || parent.k === 'mix' || parent.k === 'sigma' || parent.k === 'integ' || parent.k === 'deriv';
  if (vertical && k < names.length - 1 && !(parent.k === 'mix' && k === 0)) {
    const next = names[k + 1];
    e.cur = { path: [...e.cur.path.slice(0, -1), { idx: step.idx, slot: next }], idx: Math.min(e.cur.idx, getSlot(parent, next).length) };
    return true;
  }
  return false;
}

export function moveUp(e: Editor): boolean {
  const step = e.cur.path[e.cur.path.length - 1];
  if (!step) return false;
  const parent = slotAt(e.root, e.cur.path.slice(0, -1))[step.idx] as Structured;
  const names = slotNames(parent);
  const k = names.indexOf(step.slot);
  const vertical = parent.k === 'frac' || parent.k === 'mix' || parent.k === 'sigma' || parent.k === 'integ' || parent.k === 'deriv';
  if (vertical && k > 0 && !(parent.k === 'mix' && k === 1)) {
    const prev = names[k - 1];
    e.cur = { path: [...e.cur.path.slice(0, -1), { idx: step.idx, slot: prev }], idx: Math.min(e.cur.idx, getSlot(parent, prev).length) };
    return true;
  }
  return false;
}

export function moveHome(e: Editor): void {
  e.cur = { path: [], idx: 0 };
}
export function moveEnd(e: Editor): void {
  e.cur = { path: [], idx: e.root.length };
}

// ---------------------------------------------------------------- deletion

const structEmpty = (it: Structured): boolean => slotNames(it).every((n) => getSlot(it, n).length === 0);

/** DEL key */
export function deleteBack(e: Editor): void {
  const slot = currentSlot(e);
  if (e.cur.idx > 0) {
    const it = slot[e.cur.idx - 1];
    if (!isStruct(it) || (it.k === 'pow' && it.fixed) || structEmpty(it)) {
      slot.splice(e.cur.idx - 1, 1);
      e.cur.idx--;
    } else moveLeft(e); // enter the structure first, like the real device
    return;
  }
  if (e.cur.path.length === 0) return;
  const step = e.cur.path[e.cur.path.length - 1];
  const parentSlot = slotAt(e.root, e.cur.path.slice(0, -1));
  const parent = parentSlot[step.idx] as Structured;
  if (structEmpty(parent)) {
    parentSlot.splice(step.idx, 1);
    e.cur = { path: e.cur.path.slice(0, -1), idx: step.idx };
  } else {
    // not empty: step out in front of the structure
    exitSlot(e, false);
  }
}

/** true if the whole expression is empty */
export const isEmpty = (e: Editor): boolean => e.root.length === 0;

// ---------------------------------------------------------------- helpers for the machine

/** item immediately left of the cursor (in the current slot) */
export function prevItem(e: Editor): Item | undefined {
  return currentSlot(e)[e.cur.idx - 1];
}

/** Put the cursor at the end of the root slot. */
export function toEnd(e: Editor): void {
  e.cur = { path: [], idx: e.root.length };
}

/** Replace the whole content. */
export function setRoot(e: Editor, root: Slot): void {
  e.root = root;
  toEnd(e);
}
