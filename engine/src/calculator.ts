// The calculator: key handling state machine producing a Screen view model.

import { CONSTANTS, CONVERSIONS } from './constants';
import { CalcError } from './errors';
import { makeCtx, type EvalCtx, type Val } from './evaluator';
import { roundForDisplay } from './format/value';
import { resolveKey } from './keypad';
import * as N from './num';
import type { Row, Screen, Status } from './screen';
import { emptyStatus } from './screen';
import { defaultSetup, type Setup } from './settings';
import { valFromJ, valToJ } from './serialize';

export type ModeId = 'COMP' | 'CMPLX' | 'BASE' | 'EQN' | 'INEQ' | 'STAT' | 'DIST' | 'TABLE' | 'MATRIX' | 'VECTOR' | 'RATIO' | 'SPREAD' | 'VERIFY';

export interface ModeScreen {
  rows: Row[];
  cursorRow?: number;
  title?: string;
  status?: Partial<Status>;
}

export interface ModeController {
  /** handle a command; return true when consumed */
  handle(cmd: string): boolean;
  screen(): ModeScreen;
  serialize(): unknown;
  restore(j: unknown): void;
  /** called when the mode becomes active */
  enter?(): void;
}

export type ModeFactory = (calc: Calculator) => ModeController;

export interface MenuItem {
  label: string;
  sub?: string;
}

export interface Menu {
  title?: string;
  items: MenuItem[];
  sel: number;
  pick?(i: number): void;
  cancel?: () => void;
  /** digit keys: 'index' picks the nth item; 'code' collects a two-digit code; 'label' picks the item whose label equals the digit */
  digits?: 'index' | 'code' | 'label';
  buf?: string;
  /** message-only screen (confirmation prompts) */
  message?: string[];
  onConfirm?: () => void;
}

const VAR_KEYS: Record<string, string> = { neg: 'A', dms: 'B', hyp: 'C', sin: 'D', cos: 'E', tan: 'F', rpar: 'X', sd: 'Y', mplus: 'M' };

const MODE_LIST: { id: ModeId; label: string }[] = [
  { id: 'COMP', label: 'Calculate' },
  { id: 'CMPLX', label: 'Complex' },
  { id: 'BASE', label: 'Base-N' },
  { id: 'EQN', label: 'Equation/Func' },
  { id: 'INEQ', label: 'Inequality' },
  { id: 'STAT', label: 'Statistics' },
  { id: 'DIST', label: 'Distribution' },
  { id: 'TABLE', label: 'Table' },
  { id: 'MATRIX', label: 'Matrix' },
  { id: 'VECTOR', label: 'Vector' },
  { id: 'RATIO', label: 'Ratio' },
  { id: 'SPREAD', label: 'Spreadsheet' },
  { id: 'VERIFY', label: 'Verify' },
];

const modeFactories = new Map<ModeId, ModeFactory>();
export function registerMode(id: ModeId, f: ModeFactory): void {
  modeFactories.set(id, f);
}

export class Calculator {
  setup: Setup = defaultSetup();
  ctx: EvalCtx;
  on = true;
  shift = false;
  alpha = false;
  hyp = false;
  sto = false;
  rcl = false;
  mode: ModeId = 'COMP';
  menu: Menu | null = null;
  /** set when an unexpected (non-calculator) error occurred; cleared by the next key press */
  fatal: string | null = null;
  private controllers = new Map<ModeId, ModeController>();
  /** observers (UI) */
  private listeners: (() => void)[] = [];

  constructor() {
    this.ctx = makeCtx({ angle: this.setup.angle });
    this.applySetupToCtx();
  }

  // ------------------------------------------------------------ context

  applySetupToCtx(): void {
    this.ctx.angle = this.setup.angle;
    this.ctx.complex = this.mode === 'CMPLX';
    this.ctx.round = (n) => roundForDisplay(n, this.setup);
  }

  setAns(v: Val): void {
    this.ctx.preAns = this.ctx.ans;
    this.ctx.ans = v;
  }

  takeHyp(): boolean {
    const h = this.hyp;
    this.hyp = false;
    return h;
  }

  get controller(): ModeController {
    let c = this.controllers.get(this.mode);
    if (!c) {
      const f = modeFactories.get(this.mode);
      if (!f) throw new Error(`mode ${this.mode} not registered`);
      c = f(this);
      this.controllers.set(this.mode, c);
    }
    return c;
  }

  getController(id: ModeId): ModeController | undefined {
    return this.controllers.get(id);
  }

  subscribe(f: () => void): () => void {
    this.listeners.push(f);
    return () => (this.listeners = this.listeners.filter((x) => x !== f));
  }
  private notify(): void {
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------ keys

  /** Press a physical key by id (see keypad.ts). */
  press(id: string): void {
    try {
      this.pressInner(id);
      this.fatal = null;
    } catch (e) {
      // An unexpected engine failure must never take the UI down: show a system error, AC recovers.
      this.fatal = e instanceof Error ? e.message : String(e);
      this.menu = null;
    }
    this.notify();
  }

  private pressInner(id: string): void {
    if (!this.on) {
      if (id === 'on') this.powerOn();
      return;
    }
    if (id === 'shift') {
      this.shift = !this.shift;
      this.alpha = false;
      return;
    }
    if (id === 'alpha') {
      this.alpha = !this.alpha;
      this.shift = false;
      return;
    }
    // STO / RCL waiting for a variable key
    if (this.sto || this.rcl) {
      const v = VAR_KEYS[id];
      const wasSto = this.sto;
      this.sto = false;
      this.rcl = false;
      this.shift = false;
      this.alpha = false;
      if (v) {
        if (wasSto) this.storeTo(v);
        else this.exec(v);
      }
      return;
    }
    const cmd = resolveKey(id, this.shift, this.alpha);
    const wasShift = this.shift;
    this.shift = false;
    this.alpha = false;
    if (cmd === null) return;
    if (cmd === 'hyp') {
      this.hyp = true;
      return;
    }
    void wasShift;
    this.exec(cmd);
    if (cmd !== 'sin' && cmd !== 'cos' && cmd !== 'tan' && cmd !== 'asin' && cmd !== 'acos' && cmd !== 'atan') this.hyp = false;
  }

  /** Execute a command (after SHIFT/ALPHA resolution). */
  exec(cmd: string): void {
    if (!this.on) return;
    if (this.menu) {
      this.menuCmd(cmd);
      return;
    }
    switch (cmd) {
      case 'on':
        this.powerOn();
        return;
      case 'off':
        this.on = false;
        return;
      case 'mode':
        this.openModeMenu();
        return;
      case 'setup':
        this.openSetupMenu();
        return;
      case 'sto':
        this.sto = true;
        return;
      case 'rcl':
        this.rcl = true;
        return;
      case 'mplus':
      case 'mminus':
        this.memory(cmd === 'mplus' ? 1 : -1);
        return;
      case 'clr':
        this.openClrMenu();
        return;
      case 'const':
        this.openConstMenu();
        return;
      case 'conv':
        this.openConvMenu();
        return;
      case 'drg':
        this.openAngleMenu();
        return;
      case 'optn':
        if (!this.controller.handle('optn')) this.openOptnMenu();
        return;
      default:
        break;
    }
    this.controller.handle(cmd);
  }

  private powerOn(): void {
    this.on = true;
    this.shift = this.alpha = this.hyp = this.sto = this.rcl = false;
    this.menu = null;
  }

  // ------------------------------------------------------------ variables & memory

  storeTo(name: string): void {
    const c = this.controller as ModeController & { currentValue?: () => Val | null };
    const v = c.currentValue ? c.currentValue() : this.ctx.ans;
    if (v) this.ctx.vars[name] = v;
  }

  private memory(sign: 1 | -1): void {
    const c = this.controller as ModeController & { currentValue?: () => Val | null };
    const v = c.currentValue ? c.currentValue() : this.ctx.ans;
    if (!v || (v.t !== 'x' && v.t !== 'a')) return;
    const m = this.ctx.vars.M;
    const cur = m && (m.t === 'x' || m.t === 'a') ? m : N.ZERO;
    try {
      this.ctx.vars.M = sign > 0 ? N.add(cur, v) : N.sub(cur, v);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
    }
  }

  // ------------------------------------------------------------ menus

  openMenu(m: Menu): void {
    this.menu = m;
  }
  closeMenu(): void {
    this.menu = null;
  }

  private menuCmd(cmd: string): void {
    const m = this.menu!;
    const n = m.items.length;
    if (m.message) {
      if (cmd === 'eq') {
        this.menu = null;
        m.onConfirm?.();
      } else if (cmd === 'ac') {
        this.menu = null;
        m.cancel?.();
      }
      return;
    }
    switch (cmd) {
      case 'ac':
        this.menu = null;
        m.cancel?.();
        return;
      case 'up':
        if (n > 0) m.sel = (m.sel - 1 + n) % n;
        return;
      case 'down':
        if (n > 0) m.sel = (m.sel + 1) % n;
        return;
      case 'eq':
        this.menu = null;
        m.pick?.(m.sel);
        return;
      default:
        break;
    }
    if (/^[0-9]$/.test(cmd)) {
      if (m.digits === 'index' || (m.digits === undefined && n <= 10)) {
        const i = cmd === '0' ? 9 : Number(cmd) - 1;
        if (i < n) {
          this.menu = null;
          m.pick?.(i);
        }
      } else if (m.digits === 'label') {
        const i = m.items.findIndex((it) => it.label === cmd);
        if (i >= 0) {
          this.menu = null;
          m.pick?.(i);
        }
      } else if (m.digits === 'code') {
        m.buf = (m.buf ?? '') + cmd;
        if (m.buf.length === 2) {
          const i = Number(m.buf) - 1;
          m.buf = '';
          if (i >= 0 && i < n) {
            this.menu = null;
            m.pick?.(i);
          }
        }
      }
    }
  }

  private openModeMenu(): void {
    this.openMenu({
      title: 'MODE',
      items: MODE_LIST.map((m, i) => ({ label: `${i + 1}:${m.label}` })),
      sel: MODE_LIST.findIndex((m) => m.id === this.mode),
      digits: 'index',
      pick: (i) => this.setMode(MODE_LIST[i].id),
    });
  }

  setMode(id: ModeId): void {
    if (!modeFactories.has(id)) {
      this.mode = id; // shows "not available" screen via missing controller handling below
    }
    this.mode = id;
    this.applySetupToCtx();
    if (modeFactories.has(id)) this.controller.enter?.();
  }

  private openSetupMenu(): void {
    const s = this.setup;
    const sub = (title: string, labels: string[], apply: (i: number) => void, sel = 0) =>
      this.openMenu({ title, items: labels.map((l, i) => ({ label: `${i + 1}:${l}` })), sel, digits: 'index', pick: apply });
    const apply = () => {
      this.applySetupToCtx();
    };
    const items = [
      'Input/Output',
      'Angle Unit',
      'Number Format',
      'Engineer Symbol',
      'Fraction Result',
      'Complex',
      'Statistic',
      'Table',
      'Decimal Mark',
      'Digit Separator',
    ];
    this.openMenu({
      title: 'SETUP',
      items: items.map((l, i) => ({ label: `${i + 1}:${l}` })),
      sel: 0,
      digits: 'index',
      pick: (i) => {
        switch (i) {
          case 0:
            sub('Input/Output', ['MthIO', 'LineIO'], (j) => ((s.io = j === 0 ? 'math' : 'line'), apply()), s.io === 'math' ? 0 : 1);
            break;
          case 1:
            sub('Angle Unit', ['Degree', 'Radian', 'Gradian'], (j) => ((s.angle = (['deg', 'rad', 'gra'] as const)[j]), apply()), ['deg', 'rad', 'gra'].indexOf(s.angle));
            break;
          case 2:
            sub('Number Format', ['Fix', 'Sci', 'Norm'], (j) => {
              if (j === 2) {
                sub('Norm', ['Norm1', 'Norm2'], (k) => ((s.numFmt = { kind: k === 0 ? 'norm1' : 'norm2', n: 0 }), apply()));
              } else {
                const kind = j === 0 ? 'fix' : 'sci';
                const labels = kind === 'fix' ? ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] : ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
                this.openMenu({
                  title: kind === 'fix' ? 'Fix 0~9?' : 'Sci 0~9?',
                  items: labels.map((l) => ({ label: l })),
                  sel: 0,
                  digits: 'label',
                  pick: (k) => ((s.numFmt = { kind, n: k }), apply()),
                });
              }
            });
            break;
          case 3:
            sub('Engineer Symbol', ['On', 'Off'], (j) => ((s.engSymbol = j === 0), apply()), s.engSymbol ? 0 : 1);
            break;
          case 4:
            sub('Fraction Result', ['ab/c', 'd/c'], (j) => ((s.frac = j === 0 ? 'abc' : 'dc'), apply()), s.frac === 'abc' ? 0 : 1);
            break;
          case 5:
            sub('Complex', ['a+bi', 'r∠θ'], (j) => ((s.complexFmt = j === 0 ? 'rect' : 'polar'), apply()), s.complexFmt === 'rect' ? 0 : 1);
            break;
          case 6:
            sub('Statistic', ['ON', 'OFF'], (j) => ((s.statFreq = j === 0), apply()), s.statFreq ? 0 : 1);
            break;
          case 7:
            sub('Table', ['f(x)', 'f(x),g(x)'], (j) => ((s.tableFn = j === 0 ? 'f' : 'fg'), apply()), s.tableFn === 'f' ? 0 : 1);
            break;
          case 8:
            sub('Decimal Mark', ['Dot', 'Comma'], (j) => ((s.decimalMark = j === 0 ? '.' : ','), apply()), s.decimalMark === '.' ? 0 : 1);
            break;
          case 9:
            sub('Digit Separator', ['On', 'Off'], (j) => ((s.digitSep = j === 0), apply()), s.digitSep ? 0 : 1);
            break;
        }
      },
    });
  }

  private openClrMenu(): void {
    this.openMenu({
      title: 'CLR',
      items: [{ label: '1:Setup Data' }, { label: '2:Memory' }, { label: '3:All' }],
      sel: 0,
      digits: 'index',
      pick: (i) => {
        const what = ['Setup Data', 'Memory', 'All'][i];
        this.openMenu({
          items: [],
          sel: 0,
          message: [`Reset ${what}?`, '', '[=]:Yes', '[AC]:Cancel'],
          onConfirm: () => this.reset(i),
        });
      },
    });
  }

  private reset(kind: number): void {
    if (kind === 0 || kind === 2) {
      this.setup = defaultSetup();
    }
    if (kind === 1 || kind === 2) {
      this.ctx.vars = {};
      this.ctx.ans = N.ZERO;
      this.ctx.preAns = N.ZERO;
    }
    if (kind === 2) {
      this.controllers.clear();
      this.mode = 'COMP';
    }
    this.applySetupToCtx();
  }

  private insertViaController(cmd: string): void {
    this.controller.handle(cmd);
  }

  private openConstMenu(): void {
    this.openMenu({
      title: 'CONST',
      items: CONSTANTS.map((c) => ({ label: `${String(c.n).padStart(2, '0')}:${c.sym}`, sub: c.value })),
      sel: 0,
      digits: 'code',
      pick: (i) => this.insertViaController(`const:${i + 1}`),
    });
  }

  private openConvMenu(): void {
    this.openMenu({
      title: 'CONV',
      items: CONVERSIONS.map((c) => ({ label: `${String(c.n).padStart(2, '0')}:${c.from}▶${c.to}` })),
      sel: 0,
      digits: 'code',
      pick: (i) => this.insertViaController(`seq:Conv(|${String(i + 1).padStart(2, '0')[0]}|${String(i + 1).padStart(2, '0')[1]}|)`),
    });
  }

  private openOptnMenu(): void {
    const entries: [string, string][] = [
      ['GCD(', 'tok:GCD('],
      ['LCM(', 'tok:LCM('],
      ['Int(', 'tok:Int('],
      ['Intg(', 'tok:Intg('],
      ['Rem(', 'tok:Rem('],
      ['Quotient(', 'tok:Quotient('],
      ['RanInt#(', 'ranint'],
      ['Ran#', 'ranhash'],
      ['Rnd(', 'rnd'],
      ['Fact(', 'tok:Fact('],
    ];
    this.openMenu({
      title: 'OPTN',
      items: entries.map(([l], i) => ({ label: `${(i + 1) % 10}:${l}` })),
      sel: 0,
      digits: 'index',
      pick: (i) => this.insertViaController(entries[i][1]),
    });
  }

  private openAngleMenu(): void {
    this.openMenu({
      title: 'ANGLE',
      items: [{ label: '1:°' }, { label: '2:ʳ' }, { label: '3:ᵍ' }, { label: '4:▶DMS' }],
      sel: 0,
      digits: 'index',
      pick: (i) => this.insertViaController(['tok:°', 'tok:ʳ', 'tok:ᵍ', 'tok:▶DMS'][i]),
    });
  }

  // ------------------------------------------------------------ status & screen

  status(): Status {
    const st = emptyStatus();
    st.shift = this.shift;
    st.alpha = this.alpha;
    st.hyp = this.hyp;
    st.sto = this.sto;
    st.rcl = this.rcl;
    st.angle = this.setup.angle === 'deg' ? 'D' : this.setup.angle === 'rad' ? 'R' : 'G';
    st.fix = this.setup.numFmt.kind === 'fix';
    st.sci = this.setup.numFmt.kind === 'sci';
    st.math = this.setup.io === 'math';
    st.eng = this.setup.engSymbol;
    const m = this.ctx.vars.M;
    st.m = !!m && !(m.t === 'x' || m.t === 'a' ? N.isZero(m) : false);
    st.mode = this.mode;
    st.complex = this.mode === 'CMPLX';
    return st;
  }

  get screen(): Screen {
    const st = this.status();
    if (!this.on) return { on: false, status: st, rows: [] };
    if (this.fatal !== null) {
      return { on: true, status: st, rows: [{ t: 'line', text: 'System ERROR' }, { t: 'line', text: '' }, { t: 'line', text: '[AC] :Cancel', dim: true }] };
    }
    if (this.menu) return this.menuScreen(st);
    if (!modeFactories.has(this.mode)) {
      return {
        on: true,
        status: st,
        rows: [{ t: 'line', text: MODE_LIST.find((m) => m.id === this.mode)!.label }, { t: 'line', text: 'Not available yet', dim: true }],
      };
    }
    const ms = this.controller.screen();
    return { on: true, status: { ...st, ...ms.status }, rows: ms.rows, cursorRow: ms.cursorRow, title: ms.title };
  }

  private menuScreen(st: Status): Screen {
    const m = this.menu!;
    if (m.message) {
      return { on: true, status: st, rows: m.message.map((t) => ({ t: 'line' as const, text: t })) };
    }
    const rows: Row[] = [];
    const visible = m.title ? 3 : 4;
    const n = m.items.length;
    let top = 0;
    if (n > visible) top = Math.min(Math.max(0, m.sel - 1), n - visible);
    if (m.title) rows.push({ t: 'line', text: m.title + (m.buf ? ` ${m.buf}_` : ''), title: true });
    for (let i = top; i < Math.min(n, top + visible); i++) {
      const it = m.items[i];
      rows.push({ t: 'line', text: it.sub ? `${it.label}  ${it.sub}` : it.label, inv: i === m.sel, align: 'left' });
    }
    st.up = top > 0;
    st.down = top + visible < n;
    return { on: true, status: st, rows };
  }

  // ------------------------------------------------------------ persistence

  serialize(): unknown {
    const controllers: Record<string, unknown> = {};
    for (const [id, c] of this.controllers) controllers[id] = c.serialize();
    const vars: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.ctx.vars)) if (v) vars[k] = valToJ(v);
    return { v: 1, setup: this.setup, mode: this.mode, vars, ans: valToJ(this.ctx.ans), preAns: valToJ(this.ctx.preAns), controllers };
  }

  restore(j: unknown): void {
    const o = j as {
      setup?: Setup;
      mode?: ModeId;
      vars?: Record<string, never>;
      ans?: never;
      preAns?: never;
      controllers?: Record<string, unknown>;
    };
    if (!o || typeof o !== 'object') return;
    try {
      if (o.setup) this.setup = { ...defaultSetup(), ...o.setup };
      if (o.vars) {
        this.ctx.vars = {};
        for (const [k, v] of Object.entries(o.vars)) this.ctx.vars[k] = valFromJ(v);
      }
      if (o.ans) this.ctx.ans = valFromJ(o.ans);
      if (o.preAns) this.ctx.preAns = valFromJ(o.preAns);
      if (o.mode && MODE_LIST.some((m) => m.id === o.mode)) this.mode = o.mode;
      this.applySetupToCtx();
      if (o.controllers) {
        for (const [id, st] of Object.entries(o.controllers)) {
          if (!modeFactories.has(id as ModeId)) continue;
          const saved = this.mode;
          this.mode = id as ModeId;
          this.controller.restore(st);
          this.mode = saved;
        }
      }
      this.applySetupToCtx();
    } catch {
      /* corrupt saved state: ignore */
    }
  }
}
