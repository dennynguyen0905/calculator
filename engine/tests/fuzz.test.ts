import { describe, expect, it } from 'vitest';
import { Calculator } from '../src/calculator';
import { ALL_KEYS, PAD_KEYS } from '../src/keypad';
import '../src/modes';

// Deterministic PRNG so failures are reproducible.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = [...ALL_KEYS.map((k) => k.id), ...PAD_KEYS].filter((k) => k !== 'on');
// weight digits, '=' and mode-changing keys so that interesting states are reached
const WEIGHTED = [...KEYS, ...'0123456789'.split(''), 'eq', 'eq', 'eq', 'ac', 'shift', 'alpha', 'mode', 'down', 'right'];

function describeScreen(c: Calculator): string {
  const s = c.screen;
  return JSON.stringify(s.rows).slice(0, 200);
}

describe('fuzz: random key presses never crash the engine', () => {
  for (let seed = 1; seed <= 78; seed++) {
    it(`seed ${seed}`, () => {
      const rand = rng(seed * 7919);
      const c = new Calculator();
      const trail: string[] = [];
      // start every run in a different mode (the MODE menu has 13 entries; ▼ reaches the last ones)
      const startMode = seed % 13;
      c.press('mode');
      for (let d = 0; d < startMode; d++) c.press('down');
      c.press('eq');
      for (let i = 0; i < 400; i++) {
        const k = WEIGHTED[Math.floor(rand() * WEIGHTED.length)];
        trail.push(k);
        c.press(k);
        if (c.fatal !== null) {
          throw new Error(`fatal "${c.fatal}" after keys: ${trail.slice(-30).join(' ')}`);
        }
        // the screen must always be buildable and serialisable
        const s = c.screen;
        expect(Array.isArray(s.rows)).toBe(true);
        if (i % 50 === 0) {
          JSON.stringify(c.serialize());
          describeScreen(c);
        }
      }
    });
  }

  it('state survives serialisation after random use', () => {
    const rand = rng(12345);
    const a = new Calculator();
    for (let i = 0; i < 500; i++) a.press(WEIGHTED[Math.floor(rand() * WEIGHTED.length)]);
    const j = JSON.parse(JSON.stringify(a.serialize()));
    const b = new Calculator();
    b.restore(j);
    b.press('ac');
    expect(b.fatal).toBeNull();
    expect(Array.isArray(b.screen.rows)).toBe(true);
  });
});
