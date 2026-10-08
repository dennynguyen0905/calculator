import { describe, expect, it } from 'vitest';
import { lines, newCalc, press, res, run } from './keyhelpers';

describe('key presses: basics', () => {
  it('starts with 0', () => {
    expect(run('')).toEqual(['|', '0']);
  });
  it('1 + 2 =', () => {
    expect(run('1 add 2 eq')).toEqual(['1+2', '3']);
  });
  it('shows cursor while typing', () => {
    expect(run('1 add 2')[0]).toBe('1+2|');
  });
  it('operators after a result use Ans', () => {
    expect(res('5 eq add 3 eq')).toBe('8');
    expect(run('5 eq add 3')[0]).toBe('Ans+3|');
  });
  it('digits after a result start a new expression', () => {
    expect(run('5 eq 7 eq')).toEqual(['7', '7']);
  });
  it('AC clears, DEL deletes', () => {
    expect(run('1 2 3 del')[0]).toBe('12|');
    expect(run('1 2 3 ac')).toEqual(['|', '0']);
  });
  it('x² and Ans', () => {
    expect(res('9 eq sq eq')).toBe('81');
    expect(run('3 sq')[0]).toBe('3^2|');
  });
  it('shift functions: sin⁻¹, x³, nPr, nCr', () => {
    expect(run('shift sin')[0]).toBe('sin⁻¹(|');
    expect(res('2 shift sq eq')).toBe('8');
    expect(res('5 shift mul 2 eq')).toBe('20');
    expect(res('5 shift div 2 eq')).toBe('10');
  });
  it('hyp sin', () => {
    expect(run('hyp sin')[0]).toBe('sinh(|');
    expect(res('hyp sin 1 eq')).toBe('1.175201194');
  });
  it('alpha variables', () => {
    expect(run('alpha neg')[0]).toBe('A|');
    expect(run('alpha rpar')[0]).toBe('X|');
  });
  it('pi and e via shift/alpha on ×10ˣ', () => {
    expect(res('shift exp eq')).toBe('π');
    expect(res('alpha exp pow 1 right eq')).toBe('2.718281828');
  });
  it('×10^x key', () => {
    expect(res('1 exp 3 eq')).toBe('1000');
    expect(res('2 exp 3 right add 1 eq')).toBe('2001');
  });
});

describe('key presses: natural display editing', () => {
  it('fraction captures the number before the cursor', () => {
    expect(run('1 frac')[0]).toBe('1/|');
    expect(res('1 frac 3 right add 1 frac 6 eq')).toBe('1/2');
  });
  it('fraction from empty', () => {
    expect(res('frac 1 down 2 eq')).toBe('1/2');
  });
  it('sqrt template', () => {
    expect(res('sqrt 8 eq')).toBe('2√2');
    expect(res('sqrt 4 right add 1 eq')).toBe('3');
  });
  it('power template', () => {
    expect(res('2 pow 1 0 right eq')).toBe('1024');
  });
  it('DEL deletes an empty template in one go', () => {
    expect(run('frac del')[0]).toBe('|');
    expect(run('sqrt del')[0]).toBe('|');
  });
  it('DEL on the right edge of a template enters it', () => {
    expect(run('sqrt 8 right del')[0]).toBe('√(8|)');
  });
  it('cursor moves through nested structures', () => {
    expect(res('frac 1 down 2 right add 3 eq')).toBe('7/2');
  });
  it('log with base template (ALPHA+log)', () => {
    expect(res('alpha log 2 right 8 eq')).toBe('3');
  });
  it('integral template with limits', () => {
    expect(res('integ alpha rpar sq down 0 down 1 eq')).toBe('0.3333333333');
  });
  it('overwrite mode', () => {
    const c = newCalc();
    press(c, '1 2 3 left left left shift del');
    press(c, '9');
    expect(lines(c)[0]).toBe('9|23');
  });
});

describe('key presses: S⇔D, ENG, DMS', () => {
  it('S⇔D toggles fraction and decimal', () => {
    const c = newCalc();
    press(c, '1 frac 3 right eq');
    expect(lines(c)[1]).toBe('1/3');
    press(c, 'sd');
    expect(lines(c)[1]).toBe('0.3333333333');
    press(c, 'sd');
    expect(lines(c)[1]).toBe('1/3');
  });
  it('S⇔D on √', () => {
    const c = newCalc();
    press(c, 'sqrt 2 right eq sd');
    expect(lines(c)[1]).toBe('1.414213562');
  });
  it('S⇔D does nothing on integers', () => {
    const c = newCalc();
    press(c, '5 eq sd');
    expect(lines(c)[1]).toBe('5');
  });
  it('ENG shifts the exponent', () => {
    const c = newCalc();
    press(c, '1 2 3 4 5 6 exp 6 right eq');
    expect(lines(c)[1]).toBe('1.23456×10^11');
    press(c, 'eng');
    expect(lines(c)[1]).toBe('123.456×10^9');
    press(c, 'eng');
    expect(lines(c)[1]).toBe('0.123456×10^12');
    press(c, 'shift eng shift eng');
    expect(lines(c)[1]).toBe('1.23456×10^11');
  });
  it('ENG on a plain number', () => {
    const c = newCalc();
    press(c, '1 2 3 4 eq eng');
    expect(lines(c)[1]).toBe('1.234×10^3');
    press(c, 'eng');
    expect(lines(c)[1]).toBe('0.001234×10^6');
    press(c, 'shift eng shift eng shift eng');
    expect(lines(c)[1]).toBe('1234000×10^-3');
  });
  it('DMS entry and ▶DMS', () => {
    const c = newCalc();
    press(c, '1 dms 3 0 dms 0 dms eq');
    expect(lines(c)[1]).toBe('1.5');
    const d = newCalc();
    press(d, '1 dot 5 eq shift ans 4');
    expect(lines(d)[1]).toBe('1°30′0″');
  });
});

describe('key presses: memory, STO / RCL', () => {
  it('STO and RCL', () => {
    const c = newCalc();
    press(c, '7 eq shift rcl neg');
    press(c, 'ac alpha neg add 3 eq');
    expect(lines(c)[1]).toBe('10');
  });
  it('M+ and M-', () => {
    const c = newCalc();
    press(c, '5 mplus ac alpha mplus eq');
    expect(lines(c)[1]).toBe('5');
    press(c, 'ac 2 shift mplus ac alpha mplus eq');
    expect(lines(c)[1]).toBe('3');
    expect(c.screen.status.m).toBe(true);
  });
  it('Ans and PreAns', () => {
    const c = newCalc();
    press(c, '2 eq 3 eq ans mul 2 eq');
    expect(lines(c)[1]).toBe('6');
    press(c, 'ac alpha ans eq');
    expect(lines(c)[1]).toBe('3');
  });
  it('RCL inserts the variable', () => {
    const c = newCalc();
    press(c, '4 eq shift rcl cos ac rcl cos add 1 eq');
    expect(lines(c)[1]).toBe('5');
  });
});

describe('key presses: history (REPLAY)', () => {
  it('up recalls the previous expression', () => {
    const c = newCalc();
    press(c, '1 add 1 eq ac 2 mul 3 eq ac up');
    expect(lines(c)).toEqual(['2×3', '6']);
    press(c, 'up');
    expect(lines(c)).toEqual(['1+1', '2']);
    press(c, 'down');
    expect(lines(c)).toEqual(['2×3', '6']);
    press(c, 'down');
    expect(lines(c)).toEqual(['|', '']);
  });
  it('after = the up key shows the calculation before the current one', () => {
    const c = newCalc();
    press(c, '1 add 1 eq 2 mul 3 eq up');
    expect(lines(c)).toEqual(['1+1', '2']);
  });
  it('typing after a replayed calculation starts from its answer or a new expression', () => {
    const c = newCalc();
    press(c, '1 add 1 eq ac up add 5 eq');
    expect(lines(c)).toEqual(['Ans+5', '7']);
  });
  it('left after replay edits the recalled expression', () => {
    const c = newCalc();
    press(c, '1 add 1 eq ac up left');
    expect(lines(c)[0]).toBe('1+1|');
  });
  it('left after a result edits the expression', () => {
    const c = newCalc();
    press(c, '1 2 add 3 eq left');
    expect(lines(c)[0]).toBe('12+3|');
    press(c, 'del 4 eq');
    expect(lines(c)[1]).toBe('16');
  });
  it('right after a result goes to the start', () => {
    const c = newCalc();
    press(c, '1 2 add 3 eq right');
    expect(lines(c)[0]).toBe('|12+3');
  });
});

describe('key presses: errors', () => {
  it('Math ERROR screen and AC', () => {
    const c = newCalc();
    press(c, '1 div 0 eq');
    expect(lines(c)[0]).toBe('Math ERROR');
    press(c, 'ac');
    expect(lines(c)).toEqual(['|', '0']);
  });
  it('Syntax ERROR goto', () => {
    const c = newCalc();
    press(c, '1 add mul 2 eq');
    expect(lines(c)[0]).toBe('Syntax ERROR');
    press(c, 'left');
    expect(lines(c)[0].includes('|')).toBe(true);
  });
  it('keys are ignored during an error except AC and arrows', () => {
    const c = newCalc();
    press(c, '1 div 0 eq 5');
    expect(lines(c)[0]).toBe('Math ERROR');
  });
});

describe('key presses: modes and setup', () => {
  it('SETUP angle unit', () => {
    const c = newCalc();
    press(c, 'shift mode 2 2'); // Angle Unit -> Radian
    expect(c.screen.status.angle).toBe('R');
    press(c, 'sin shift exp div 6 eq');
    expect(lines(c)[1]).toBe('1/2');
  });
  it('SETUP number format Fix 2', () => {
    const c = newCalc();
    press(c, 'shift mode 3 1 2');
    expect(c.screen.status.fix).toBe(true);
    press(c, '5 eq');
    expect(lines(c)[1]).toBe('5.00');
  });
  it('SETUP LineIO changes the editing templates', () => {
    const c = newCalc();
    press(c, 'shift mode 1 2');
    press(c, 'sqrt 4 eq');
    expect(lines(c)[0]).toBe('√(4');
    expect(lines(c)[1]).toBe('2');
  });
  it('MODE menu switches to CMPLX', () => {
    const c = newCalc();
    press(c, 'mode 2');
    expect(c.mode).toBe('CMPLX');
    press(c, '2 add 3 eng eq');
    expect(lines(c)[1]).toBe('2+3i');
  });
  it('CLR all', () => {
    const c = newCalc();
    press(c, '5 eq shift rcl neg ac shift 9 3 eq');
    press(c, 'alpha neg eq');
    expect(lines(c)[1]).toBe('0');
  });
  it('CONST menu inserts a constant', () => {
    const c = newCalc();
    press(c, 'shift 7 2 8 eq');
    expect(lines(c)[1]).toBe('299792458');
  });
  it('CONV menu', () => {
    const c = newCalc();
    press(c, '1 0 shift 8 0 1 eq');
    expect(lines(c)[1]).toBe('25.4');
  });
});

describe('key presses: CALC and SOLVE', () => {
  it('CALC asks for variables', () => {
    const c = newCalc();
    press(c, 'alpha neg add alpha dms calc');
    expect(lines(c)[1]).toBe('A?');
    press(c, '3 eq');
    expect(lines(c)[1]).toBe('B?');
    press(c, '4 eq');
    expect(lines(c)[1]).toBe('7');
    press(c, 'calc 1 0 eq eq');
    expect(lines(c)[1]).toBe('14');
  });
  it('CALC keeps the previous variable value when only = is pressed', () => {
    const c = newCalc();
    press(c, '5 eq shift rcl neg ac alpha neg mul 2 calc eq');
    expect(lines(c)[1]).toBe('10');
  });
  it('SOLVE x^2 - 2 = 0', () => {
    const c = newCalc();
    press(c, 'alpha rpar pow 2 right sub 2 alpha calc 0 shift calc');
    expect(lines(c)[1]).toBe('Solve for X');
    press(c, '1 eq');
    expect(lines(c)[1]).toBe('X=1.414213562 | L−R=0');
  });
  it('SOLVE linear 3X+2=11', () => {
    const c = newCalc();
    press(c, '3 alpha rpar add 2 alpha calc 1 1 shift calc eq');
    expect(lines(c)[1]).toBe('X=3 | L−R=0');
  });
  it('SOLVE can fail', () => {
    const c = newCalc();
    press(c, 'alpha rpar sq add 1 alpha calc 0 shift calc eq');
    expect(lines(c)[0]).toBe("Can't Solve");
  });
});

describe('persistence', () => {
  it('serialize / restore keeps variables, Ans, setup and history', () => {
    const a = newCalc();
    press(a, 'shift mode 2 2 5 eq shift rcl neg ac 1 add 1 eq');
    const j = JSON.parse(JSON.stringify(a.serialize()));
    const b = newCalc();
    b.restore(j);
    expect(b.setup.angle).toBe('rad');
    press(b, 'alpha neg eq');
    expect(lines(b)[1]).toBe('5');
    press(b, 'ac up up');
    expect(lines(b)).toEqual(['1+1', '2']);
  });
});
