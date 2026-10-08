import { Calculator, registerMode, type ModeController, type ModeScreen } from '../calculator';
import { evalItems, type Val } from '../evaluator';
import { ExprPad } from '../pad';
import type { Slot } from '../items';

/** COMP and CMPLX share the same pad; CMPLX enables complex arithmetic and `i`. */
export class CompController implements ModeController {
  readonly pad: ExprPad;
  constructor(
    private readonly calc: Calculator,
    private readonly complex: boolean,
  ) {
    this.pad = new ExprPad(calc, {
      allowCalc: true,
      evalFn: (items: Slot) => {
        calc.applySetupToCtx();
        return evalItems(items, calc.ctx);
      },
    });
  }

  enter(): void {
    this.calc.applySetupToCtx();
  }

  handle(cmd: string): boolean {
    if (this.complex) {
      if (cmd === 'eng') return this.pad.handle('i');
      if (cmd === 'cmplx') {
        this.calc.openMenu({
          title: 'CMPLX',
          items: [{ label: '1:Arg(' }, { label: '2:Conjg(' }, { label: '3:ReP(' }, { label: '4:ImP(' }, { label: '5:▶r∠θ' }, { label: '6:▶a+bi' }],
          sel: 0,
          digits: 'index',
          pick: (i) => this.pad.handle(['tok:Arg(', 'tok:Conjg(', 'tok:ReP(', 'tok:ImP(', 'tok:▶r∠θ', 'tok:▶a+bi'][i]),
        });
        return true;
      }
    }
    return this.pad.handle(cmd);
  }

  currentValue(): Val | null {
    return this.pad.evalCurrent();
  }

  screen(): ModeScreen {
    const r = this.pad.rows();
    return {
      rows: r.rows,
      cursorRow: r.cursorRow,
      status: { up: this.pad.hist.length > 0 && !this.pad.session, down: this.pad.histPos >= 0, disp: !!r.disp, overwrite: !this.pad.ed.insert },
    };
  }

  serialize(): unknown {
    return this.pad.serialize();
  }
  restore(j: unknown): void {
    this.pad.restore(j);
  }
}

registerMode('COMP', (c) => new CompController(c, false));
registerMode('CMPLX', (c) => new CompController(c, true));
